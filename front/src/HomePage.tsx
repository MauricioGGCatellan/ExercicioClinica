import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Stack,
  Toolbar,
  Typography,
  Divider,
  Chip,
} from "@mui/material";
import { getAuthUser } from "./auth";

export default function HomePage() {
  const navigate = useNavigate();
  const user = getAuthUser();

  function handleMenuClick(sectionId: string) {
    if (!user) {
      navigate("/login");
      return;
    }

    const el = document.getElementById(sectionId);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fff" }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: "#fff",
          color: "text.primary",
          borderBottom: "1px solid rgba(84, 172, 75, 0.18)",
        }}
      >
        <Toolbar sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                bgcolor: "#54AC4B",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
              }}
            >
              C
            </Box>
            <Box>
              <Typography fontWeight={800} lineHeight={1.1}>
                Clínica
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Portal do paciente e profissional
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button
              onClick={() => handleMenuClick("agendamentos")}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              Agendamentos
            </Button>

            <Button
              onClick={() => handleMenuClick("laudos")}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              Laudos
            </Button>
          </Stack>

          <Box sx={{ minWidth: 120, display: "flex", justifyContent: "flex-end" }}>
            {user ? (
              <Stack alignItems="flex-end" spacing={0.25}>
                <Typography fontWeight={700}>{user.name}</Typography>
                <Chip
                  size="small"
                  label={user.role === "patient" ? "Paciente" : "Profissional"}
                  sx={{
                    bgcolor: "rgba(84, 172, 75, 0.10)",
                    color: "#2f6f29",
                    fontWeight: 700,
                  }}
                />
              </Stack>
            ) : (
              <Button
                variant="outlined"
                onClick={() => navigate("/login")}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  borderColor: "#54AC4B",
                  color: "#2f6f29",
                }}
              >
                Entrar
              </Button>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 5 }}>
        <Stack spacing={4}>
          <Box>
            <Typography variant="h3" fontWeight={900} gutterBottom>
              Bem-vindo ao sistema da clínica
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8 }}>
              Este portal centraliza o agendamento de exames, o acompanhamento dos
              atendimentos e a consulta de laudos publicados. A navegação é simples,
              com acesso separado para pacientes e profissionais, mantendo as
              informações organizadas e seguras.
            </Typography>
          </Box>

          <Divider />

          <Card id="agendamentos" sx={{ borderRadius: 4, border: "1px solid rgba(84, 172, 75, 0.18)" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h5" fontWeight={800} gutterBottom>
                Agendamentos
              </Typography>
              <Typography color="text.secondary" sx={{ lineHeight: 1.8 }}>
                A área de agendamentos permite registrar exames, consultar horários
                futuros e acompanhar o status de cada atendimento. Profissionais
                podem organizar a agenda e pacientes podem visualizar seus próprios
                compromissos.
              </Typography>
            </CardContent>
          </Card>

          <Card id="laudos" sx={{ borderRadius: 4, border: "1px solid rgba(84, 172, 75, 0.18)" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h5" fontWeight={800} gutterBottom>
                Laudos
              </Typography>
              <Typography color="text.secondary" sx={{ lineHeight: 1.8 }}>
                A seção de laudos permite criar rascunhos, publicar resultados e
                consultar somente os exames que já possuem laudo liberado. O acesso
                é controlado para que cada paciente veja apenas seus próprios dados.
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </Box>
  );
}