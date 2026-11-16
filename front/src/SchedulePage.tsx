import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { getAuthUser } from "./auth";
import { apiFetch } from "./api";

type ExamType =
  | "xray"
  | "ultrasound"
  | "magnetic_resonance";

type AppointmentStatus =
  | "scheduled"
  | "cancelled"
  | "completed"
  | "no_show";

type Appointment = {
  id: string;
  patient_id: string;
  starts_at: string;
  ends_at: string;
  exam_type: ExamType;
  status: AppointmentStatus;
  patient_name?: string;
  has_published_report?: boolean;
};

type BusyAppointment = {
  starts_at: string;
};

const CLINIC_TIMEZONE = "America/Sao_Paulo";

const EXAM_LABELS: Record<ExamType, string> = {
  xray: "Raio-X",
  ultrasound: "Ultrassom",
  magnetic_resonance: "Ressonância magnética",
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Agendado",
  cancelled: "Cancelado",
  completed: "Concluído",
  no_show: "Não compareceu",
};

// 08:00, 08:30, ..., 17:00
const TIME_SLOTS = Array.from({ length: 19 }, (_, index) => {
  const minutes = 8 * 60 + index * 30;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(
    remainingMinutes
  ).padStart(2, "0")}`;
});

function getClinicDateParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
}

function getTomorrow(): string {
  const today = getClinicDateParts(new Date());

  const tomorrow = new Date(
    Date.UTC(
      Number(today.year),
      Number(today.month) - 1,
      Number(today.day) + 1
    )
  );

  const year = tomorrow.getUTCFullYear();
  const month = String(tomorrow.getUTCMonth() + 1).padStart(2, "0");
  const day = String(tomorrow.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Converte o horário da clínica para UTC, independentemente
// do fuso configurado no computador do usuário.
function toClinicISOString(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  const target = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute
  );

  const parts = getClinicDateParts(new Date(target));

  const representedAsUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  const offset = representedAsUTC - target;

  return new Date(target - offset).toISOString();
}

function getClinicTime(value: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));

  const hour = parts.find(part => part.type === "hour")?.value;
  const minute = parts.find(part => part.type === "minute")?.value;

  return `${hour}:${minute}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: CLINIC_TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSelectedDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    dateStyle: "full",
  }).format(new Date(`${value}T12:00:00Z`));
}

function getStatusColor(
  status: AppointmentStatus
): "success" | "error" | "default" | "warning" {
  switch (status) {
    case "scheduled":
      return "success";
    case "cancelled":
      return "error";
    case "completed":
      return "default";
    case "no_show":
      return "warning";
  }
}

export default function SchedulePage() {
  const user = getAuthUser();

  const isProfessional = user?.role === "professional";

  // Listagem
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal
  const [dialogOpen, setDialogOpen] = useState(false);

  // Formulário
  const [patientId, setPatientId] = useState("");
  const [selectedDate, setSelectedDate] = useState(getTomorrow);
  const [selectedTime, setSelectedTime] = useState("");
  const [examType, setExamType] = useState<ExamType>("xray");

  // Disponibilidade
  const [occupiedTimes, setOccupiedTimes] = useState<Set<string>>(
    new Set()
  );

  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  // Operação de criação
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // =====================================================
  // CARREGAR AGENDAMENTOS
  // =====================================================

  async function loadAppointments() {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const endpoint = isProfessional
        ? "/professional/appointments"
        : "/me/appointments";

      const data = await apiFetch<Appointment[]>(endpoint);

      setAppointments(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar agendamentos"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAppointments();
  }, []);

  // =====================================================
  // CONSULTAR DISPONIBILIDADE DA SALA
  // =====================================================

  useEffect(() => {
    if (!dialogOpen || !selectedDate) {
      return;
    }

    let active = true;

    async function loadAvailability() {
      setAvailabilityLoading(true);
      setAvailabilityError("");
      setOccupiedTimes(new Set());
      setSelectedTime("");

      try {
        const data = await apiFetch<BusyAppointment[]>(
          `/appointments/availability?date=${encodeURIComponent(
            selectedDate
          )}`
        );

        if (!active) return;

        const occupied = new Set(
          data.map(appointment =>
            getClinicTime(appointment.starts_at)
          )
        );

        setOccupiedTimes(occupied);
      } catch (err) {
        if (!active) return;

        setAvailabilityError(
          err instanceof Error
            ? err.message
            : "Erro ao consultar disponibilidade"
        );
      } finally {
        if (active) {
          setAvailabilityLoading(false);
        }
      }
    }

    void loadAvailability();

    return () => {
      active = false;
    };
  }, [dialogOpen, selectedDate]);

  // =====================================================
  // AÇÕES DO FORMULÁRIO
  // =====================================================

  function handleOpenDialog() {
    setPatientId("");
    setSelectedDate(getTomorrow());
    setSelectedTime("");
    setExamType("xray");

    setFormError("");
    setAvailabilityError("");

    setDialogOpen(true);
  }

  function handleCloseDialog() {
    if (saving) return;

    setDialogOpen(false);
  }

  function handleDateChange(value: string) {
    setSelectedDate(value);
    setSelectedTime("");
    setFormError("");
  }

  function handleSelectTime(time: string) {
    setSelectedTime(time);
    setFormError("");
  }

  // =====================================================
  // CRIAR AGENDAMENTO
  // =====================================================

  async function handleCreateAppointment() {
    if (!selectedDate || !selectedTime) {
      setFormError("Selecione uma data e um horário.");
      return;
    }

    if (availabilityError) {
      setFormError("Não foi possível verificar a disponibilidade.");
      return;
    }

    if (availabilityLoading) {
      return;
    }

    if (isProfessional) {
      const validUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!validUuid.test(patientId.trim())) {
        setFormError("Informe um UUID de paciente válido.");
        return;
      }
    }

    setSaving(true);
    setFormError("");

    try {
      const startsAt = toClinicISOString(
        selectedDate,
        selectedTime
      );

      const endpoint = isProfessional
        ? "/professional/appointments"
        : "/me/appointments";

      const payload = isProfessional
        ? {
            patientId: patientId.trim(),
            examType,
            startsAt,
          }
        : {
            examType,
            startsAt,
          };

      await apiFetch<Appointment>(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setDialogOpen(false);

      setPatientId("");
      setSelectedTime("");

      // Atualiza a lista com os dados do banco.
      await loadAppointments();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Erro ao criar agendamento"
      );
    } finally {
      setSaving(false);
    }
  }

  // =====================================================
  // RENDERIZAÇÃO
  // =====================================================

  const hasPatientId = !isProfessional || patientId.trim().length > 0;

  const canConfirm =
    !saving &&
    !availabilityLoading &&
    !availabilityError &&
    hasPatientId &&
    !!selectedDate &&
    !!selectedTime;

  return (
    <Box component="main">
      <Container maxWidth="lg" sx={{ py: 5 }}>

        {/* Cabeçalho */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }}
          spacing={2}
          sx={{ mb: 4 }}
        >
          <Box>
            <Typography variant="h4" fontWeight={800}>
              Agendamentos
            </Typography>

            <Typography color="text.secondary">
              Consulte e organize os exames da clínica.
            </Typography>
          </Box>

          <Button
            variant="contained"
            onClick={handleOpenDialog}
            sx={{
              bgcolor: "#54AC4B",
              borderRadius: 3,
              px: 3,
              py: 1.3,
              fontWeight: 700,
              textTransform: "none",
              "&:hover": {
                bgcolor: "#3F8D38",
              },
            }}
          >
            Novo Agendamento
          </Button>
        </Stack>

        {/* Informações para pacientes */}
        {!isProfessional && (
          <Alert severity="info" sx={{ mb: 3 }}>
            Escolha o tipo de exame, a data e o horário desejados.
            A disponibilidade é compartilhada entre todos os exames da clínica.
          </Alert>
        )}

        {/* Erro de carregamento */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Listagem */}
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
          {isProfessional
            ? "Agendamentos da clínica"
            : "Meus agendamentos"}
        </Typography>

        {loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress sx={{ color: "#54AC4B" }} />
          </Box>
        ) : appointments.length === 0 ? (
          <Card
            variant="outlined"
            sx={{
              borderRadius: 3,
              borderColor: "#B9DDB5",
            }}
          >
            <CardContent sx={{ py: 5, textAlign: "center" }}>
              <Typography color="text.secondary">
                Nenhum agendamento encontrado.
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={2}>
            {appointments.map(appointment => (
              <Card
                key={appointment.id}
                variant="outlined"
                sx={{
                  borderRadius: 3,
                  borderColor: "#B9DDB5",
                  "&:hover": {
                    boxShadow: "0 5px 18px rgba(84,172,75,0.10)",
                  },
                }}
              >
                <CardContent>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    justifyContent="space-between"
                    spacing={2}
                  >
                    <Box>
                      <Typography variant="h6" fontWeight={700}>
                        {EXAM_LABELS[appointment.exam_type]}
                      </Typography>

                      <Typography
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        {formatDateTime(appointment.starts_at)}
                      </Typography>

                      {isProfessional && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.5 }}
                        >
                          Paciente:{" "}
                          {appointment.patient_name ??
                            appointment.patient_id}
                        </Typography>
                      )}
                    </Box>

                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                    >
                      <Chip
                        label={STATUS_LABELS[appointment.status]}
                        color={getStatusColor(appointment.status)}
                        size="small"
                      />

                      {appointment.has_published_report && (
                        <Chip
                          label="Laudo publicado"
                          size="small"
                          sx={{
                            bgcolor: "#E8F5E6",
                            color: "#3F8D38",
                            fontWeight: 700,
                          }}
                        />
                      )}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Container>

      {/* ================================================= */}
      {/* MODAL DE NOVO AGENDAMENTO */}
      {/* ================================================= */}

      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle fontWeight={800}>
          Novo Agendamento
        </DialogTitle>

        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>

            {/* Identificação do paciente, apenas para profissional */}
            {isProfessional && (
              <TextField
                label="ID do paciente (UUID)"
                value={patientId}
                onChange={event => setPatientId(event.target.value)}
                fullWidth
                required
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            )}

            {/* Data */}
            <Box>
              <Typography fontWeight={700} sx={{ mb: 1 }}>
                Selecione uma data
              </Typography>

              <TextField
                type="date"
                value={selectedDate}
                onChange={event =>
                  handleDateChange(event.target.value)
                }
                fullWidth
                required
                InputLabelProps={{
                  shrink: true,
                }}
                inputProps={{
                  min: getTomorrow(),
                }}
              />
            </Box>

            {/* Horários */}
            <Box>
              <Typography fontWeight={700} sx={{ mb: 1 }}>
                Horários disponíveis
              </Typography>

              {selectedDate && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  {formatSelectedDate(selectedDate)}
                </Typography>
              )}

              {availabilityLoading ? (
                <Box
                  display="flex"
                  justifyContent="center"
                  py={3}
                >
                  <CircularProgress
                    size={28}
                    sx={{ color: "#54AC4B" }}
                  />
                </Box>
              ) : availabilityError ? (
                <Alert severity="error">
                  {availabilityError}
                </Alert>
              ) : (
                <>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(85px, 1fr))",
                      gap: 1,
                    }}
                  >
                    {TIME_SLOTS.map(time => {
                      const occupied = occupiedTimes.has(time);
                      const selected = selectedTime === time;

                      return (
                        <Button
                          key={time}
                          variant={selected ? "contained" : "outlined"}
                          disabled={occupied}
                          onClick={() => handleSelectTime(time)}
                          sx={{
                            minWidth: 0,
                            py: 1.2,
                            borderRadius: 2,
                            textTransform: "none",
                            borderColor: "#B9DDB5",

                            ...(selected && {
                              bgcolor: "#54AC4B",
                              borderColor: "#54AC4B",
                              color: "#fff",
                              "&:hover": {
                                bgcolor: "#3F8D38",
                              },
                            }),

                            ...(!occupied &&
                              !selected && {
                                color: "#3F8D38",
                              }),

                            ...(occupied && {
                              bgcolor: "#E5E5E5",
                              color: "#999",
                              borderColor: "#E5E5E5",
                            }),
                          }}
                        >
                          {time}
                        </Button>
                      );
                    })}
                  </Box>

                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{ mt: 2, flexWrap: "wrap" }}
                  >
                    <Stack
                      direction="row"
                      spacing={0.7}
                      alignItems="center"
                    >
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: 1,
                          bgcolor: "#54AC4B",
                        }}
                      />

                      <Typography variant="caption">
                        Selecionado
                      </Typography>
                    </Stack>

                    <Stack
                      direction="row"
                      spacing={0.7}
                      alignItems="center"
                    >
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: 1,
                          bgcolor: "#E5E5E5",
                        }}
                      />

                      <Typography variant="caption">
                        Ocupado
                      </Typography>
                    </Stack>

                    <Stack
                      direction="row"
                      spacing={0.7}
                      alignItems="center"
                    >
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: 1,
                          bgcolor: "#fff",
                          border: "1px solid #B9DDB5",
                        }}
                      />

                      <Typography variant="caption">
                        Disponível
                      </Typography>
                    </Stack>
                  </Stack>
                </>
              )}
            </Box>

            {/* Exame */}
            <FormControl fullWidth>
              <InputLabel id="exam-type-label">
                Tipo do exame
              </InputLabel>

              <Select
                labelId="exam-type-label"
                value={examType}
                label="Tipo do exame"
                onChange={event =>
                  setExamType(event.target.value as ExamType)
                }
              >
                <MenuItem value="xray">
                  Raio-X
                </MenuItem>

                <MenuItem value="ultrasound">
                  Ultrassom
                </MenuItem>

                <MenuItem value="magnetic_resonance">
                  Ressonância magnética
                </MenuItem>
              </Select>
            </FormControl>

            {/* Erros do formulário */}
            {formError && (
              <Alert severity="error">
                {formError}
              </Alert>
            )}

          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button
            onClick={handleCloseDialog}
            disabled={saving}
            sx={{
              color: "#5F6F5E",
              textTransform: "none",
            }}
          >
            Cancelar
          </Button>

          <Button
            variant="contained"
            onClick={handleCreateAppointment}
            disabled={!canConfirm}
            sx={{
              bgcolor: "#54AC4B",
              borderRadius: 2,
              px: 3,
              textTransform: "none",
              fontWeight: 700,
              "&:hover": {
                bgcolor: "#3F8D38",
              },
            }}
          >
            {saving ? (
              <CircularProgress size={22} color="inherit" />
            ) : (
              "Confirmar Agendamento"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}