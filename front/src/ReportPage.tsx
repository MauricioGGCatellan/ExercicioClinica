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

import type { SelectChangeEvent } from "@mui/material";
import { apiFetch } from "./api";
import { getAuthUser } from "./auth";

type ExamType = "xray" | "ultrasound" | "magnetic_resonance";
type ReportStatus = "draft" | "published";
type AppointmentStatus = "scheduled" | "cancelled" | "completed" | "no_show";

type Report = {
  id: string;
  appointment_id: string;
  patient_id: string;
  title: string;
  content: string;
  status: ReportStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  professional_name: string;
  patient_name: string;
  exam_type: ExamType;
  starts_at: string;
  appointment_status: AppointmentStatus;
  has_published_report?: boolean;
};

type AppointmentOption = {
  id: string;
  exam_type: ExamType;
  starts_at: string;
  patient_id: string;
  patient_name?: string;
  status: AppointmentStatus;
  has_published_report?: boolean;
};

const EXAM_LABELS: Record<ExamType, string> = {
  xray: "Raio-X",
  ultrasound: "Ultrassom",
  magnetic_resonance: "Ressonância magnética",
};

const STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
};

const STATUS_CHIP_COLOR: Record<ReportStatus, "default" | "success"> = {
  draft: "default",
  published: "success",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function previewText(value: string, max = 160) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trimEnd()}...`;
}

export default function ReportPage() {
  const user = getAuthUser();
  const isProfessional = user?.role === "professional";

  const [reports, setReports] = useState<Report[]>([]);
  const [appointments, setAppointments] = useState<AppointmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [error, setError] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const [viewReport, setViewReport] = useState<Report | null>(null);

  async function loadReports() {
    if (!user) return;

    setLoading(true);
    setError("");

    try {
      const endpoint = isProfessional
        ? "/professional/reports"
        : "/me/reports";

      const data = await apiFetch<Report[]>(endpoint);
      setReports(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar laudos");
    } finally {
      setLoading(false);
    }
  }

  async function loadAppointments() {
    if (!isProfessional) return;

    setAppointmentsLoading(true);
    try {
      const data = await apiFetch<AppointmentOption[]>("/professional/appointments");
      setAppointments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar agendamentos");
    } finally {
      setAppointmentsLoading(false);
    }
  }

  useEffect(() => {
    void loadReports();
    if (isProfessional) {
      void loadAppointments();
    }
  }, []);

  const availableAppointments = useMemo(() => {
    return appointments.filter(
      (appointment) =>
        appointment.status === "scheduled" &&
        !appointment.has_published_report
    );
  }, [appointments]);

  function openNewReport() {
    setSelectedReport(null);
    setSelectedAppointmentId("");
    setTitle("");
    setContent("");
    setFormError("");
    setDialogOpen(true);
  }

  function openEditReport(report: Report) {
    setSelectedReport(report);
    setSelectedAppointmentId(report.appointment_id);
    setTitle(report.title);
    setContent(report.content);
    setFormError("");
    setDialogOpen(true);
  }

  function closeDialog() {
    if (saving) return;
    setDialogOpen(false);
  }

  function openDetails(report: Report) {
    setViewReport(report);
    setDetailsOpen(true);
  }

  function closeDetails() {
    setDetailsOpen(false);
    setViewReport(null);
  }

  async function handleSaveReport() {
    if (!title.trim() || !content.trim()) {
      setFormError("Título e texto são obrigatórios.");
      return;
    }

    if (isProfessional && !selectedReport && !selectedAppointmentId) {
      setFormError("Selecione um agendamento para vincular o laudo.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      if (isProfessional && selectedReport) {
        await apiFetch<Report>(`/professional/reports/${selectedReport.id}`, {
          method: "PUT",
          body: JSON.stringify({
            title,
            text: content,
          }),
        });
      } else {
        await apiFetch<Report>("/professional/reports/drafts", {
          method: "POST",
          body: JSON.stringify({
            appointmentId: selectedAppointmentId,
            title,
            text: content,
          }),
        });
      }

      setDialogOpen(false);
      await loadReports();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar laudo");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishReport(report: Report) {
    setPublishingId(report.id);
    setError("");

    try {
      await apiFetch<Report>(`/professional/reports/${report.id}/publish`, {
        method: "PATCH",
      });

      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao publicar laudo");
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <Box component="main">
      <Container maxWidth="lg" sx={{ py: 5 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }}
          spacing={2}
          sx={{ mb: 4 }}
        >
          <Box>
            <Typography variant="h4" fontWeight={800}>
              Laudos
            </Typography>
            <Typography color="text.secondary">
              {isProfessional
                ? "Cadastre laudos como rascunho e publique quando estiverem prontos."
                : "Consulte os laudos publicados associados aos seus exames."}
            </Typography>
          </Box>

          {isProfessional && (
            <Button
              variant="contained"
              onClick={openNewReport}
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
              Novo Laudo
            </Button>
          )}
        </Stack>

        {!isProfessional && (
          <Alert severity="info" sx={{ mb: 3 }}>
            Você só pode consultar laudos já publicados.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
          {isProfessional ? "Meus laudos" : "Laudos disponíveis"}
        </Typography>

        {loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress sx={{ color: "#54AC4B" }} />
          </Box>
        ) : reports.length === 0 ? (
          <Card
            variant="outlined"
            sx={{ borderRadius: 3, borderColor: "#B9DDB5" }}
          >
            <CardContent sx={{ py: 5, textAlign: "center" }}>
              <Typography color="text.secondary">
                Nenhum laudo encontrado.
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={2}>
            {reports.map((report) => (
              <Card
                key={report.id}
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
                    <Box sx={{ flex: 1 }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        flexWrap="wrap"
                        sx={{ mb: 1 }}
                      >
                        <Typography variant="h6" fontWeight={700}>
                          {report.title}
                        </Typography>

                        <Chip
                          size="small"
                          label={STATUS_LABELS[report.status]}
                          color={STATUS_CHIP_COLOR[report.status]}
                        />
                      </Stack>

                      <Typography color="text.secondary">
                        {EXAM_LABELS[report.exam_type]} —{" "}
                        {formatDateTime(report.starts_at)}
                      </Typography>

                      <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                        Profissional responsável: {report.professional_name}
                      </Typography>

                      {isProfessional && (
                        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                          Paciente: {report.patient_name}
                        </Typography>
                      )}

                      <Typography sx={{ mt: 2, lineHeight: 1.6 }}>
                        {previewText(report.content)}
                      </Typography>
                    </Box>

                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                    >
                      <Button
                        variant="outlined"
                        onClick={() => openDetails(report)}
                        sx={{
                          textTransform: "none",
                          borderColor: "#54AC4B",
                          color: "#2f6f29",
                        }}
                      >
                        Ver
                      </Button>

                      {isProfessional && report.status === "draft" && (
                        <>
                          <Button
                            variant="outlined"
                            onClick={() => openEditReport(report)}
                            sx={{
                              textTransform: "none",
                              borderColor: "#54AC4B",
                              color: "#2f6f29",
                            }}
                          >
                            Editar
                          </Button>

                          <Button
                            variant="contained"
                            onClick={() => handlePublishReport(report)}
                            disabled={publishingId === report.id}
                            sx={{
                              bgcolor: "#54AC4B",
                              textTransform: "none",
                              fontWeight: 700,
                              "&:hover": {
                                bgcolor: "#3F8D38",
                              },
                            }}
                          >
                            {publishingId === report.id
                              ? "Publicando..."
                              : "Publicar"}
                          </Button>
                        </>
                      )}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Container>

      {/* Modal de criação/edição */}
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle fontWeight={800}>
          {selectedReport ? "Editar Laudo" : "Novo Laudo"}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            {isProfessional && !selectedReport && (
              <FormControl fullWidth>
                <InputLabel id="appointment-label">
                  Agendamento
                </InputLabel>

                <Select
                  labelId="appointment-label"
                  value={selectedAppointmentId}
                  label="Agendamento"
                  onChange={(event: SelectChangeEvent) =>
                    setSelectedAppointmentId(event.target.value)
                  }
                >
                  {appointmentsLoading ? (
                    <MenuItem value="">
                      Carregando...
                    </MenuItem>
                  ) : availableAppointments.length === 0 ? (
                    <MenuItem value="" disabled>
                      Nenhum agendamento disponível
                    </MenuItem>
                  ) : (
                    availableAppointments.map((appointment) => (
                      <MenuItem key={appointment.id} value={appointment.id}>
                        {EXAM_LABELS[appointment.exam_type]} —{" "}
                        {formatDateTime(appointment.starts_at)}
                        {appointment.patient_name
                          ? ` — ${appointment.patient_name}`
                          : ""}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            )}

            {selectedReport && (
              <Alert severity="info">
                Este laudo está vinculado ao agendamento de{" "}
                {formatDateTime(selectedReport.starts_at)}. O vínculo não é
                alterado na edição.
              </Alert>
            )}

            <TextField
              label="Título"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              fullWidth
              required
            />

            <TextField
              label="Texto do laudo"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              fullWidth
              required
              multiline
              minRows={8}
            />

            {formError && <Alert severity="error">{formError}</Alert>}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button
            onClick={closeDialog}
            disabled={saving}
            sx={{ textTransform: "none" }}
          >
            Cancelar
          </Button>

          <Button
            variant="contained"
            onClick={handleSaveReport}
            disabled={
              saving ||
              !title.trim() ||
              !content.trim() ||
              (!selectedReport && !selectedAppointmentId)
            }
            sx={{
              bgcolor: "#54AC4B",
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
              "Salvar"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de visualização */}
      <Dialog
        open={detailsOpen}
        onClose={closeDetails}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle fontWeight={800}>
          {viewReport?.title ?? "Laudo"}
        </DialogTitle>

        <DialogContent>
          {viewReport && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography color="text.secondary">
                {EXAM_LABELS[viewReport.exam_type]} —{" "}
                {formatDateTime(viewReport.starts_at)}
              </Typography>

              <Typography color="text.secondary">
                Profissional responsável: {viewReport.professional_name}
              </Typography>

              {isProfessional && (
                <Typography color="text.secondary">
                  Paciente: {viewReport.patient_name}
                </Typography>
              )}

              <Chip
                size="small"
                label={STATUS_LABELS[viewReport.status]}
                color={STATUS_CHIP_COLOR[viewReport.status]}
                sx={{ width: "fit-content" }}
              />

              <Box
                sx={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.8,
                  bgcolor: "#f9fdf8",
                  border: "1px solid rgba(84, 172, 75, 0.18)",
                  borderRadius: 3,
                  p: 2.5,
                }}
              >
                {viewReport.content}
              </Box>
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button
            onClick={closeDetails}
            sx={{ textTransform: "none" }}
          >
            Fechar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}