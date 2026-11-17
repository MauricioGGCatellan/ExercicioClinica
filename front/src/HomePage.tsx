import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Container,
  Divider,
  Stack,
  Typography,
} from "@mui/material";

import { useNavigate } from "react-router-dom";

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <Box component="main">
      <Container maxWidth="md" sx={{ py: 5 }}>
        <Stack spacing={4}>
          <Box>
            <Typography variant="h3" fontWeight={900} gutterBottom>
              Bem-vindo ao sistema da clínica
            </Typography>

            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ lineHeight: 1.8 }}
            >
              Este portal centraliza o agendamento de exames, o acompanhamento dos
              atendimentos e a consulta de laudos publicados. A navegação separa
              pacientes e profissionais, mantendo as informações organizadas e seguras.
            </Typography>
          </Box>

          <Divider />

          {/* Card de Agendamentos */}
          <Card
            id="agendamentos"
            sx={{
              borderRadius: 4,
              border: "1px solid rgba(84, 172, 75, 0.18)",
              transition: "all 0.2s ease",
              "&:hover": {
                borderColor: "#54AC4B",
                boxShadow: "0 8px 24px rgba(84, 172, 75, 0.14)",
                transform: "translateY(-2px)",
              },
            }}
          >
            <CardActionArea
              onClick={() => navigate("/agendamentos")}
              sx={{ height: "100%" }}
            >
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h5" fontWeight={800} gutterBottom>
                  Agendamentos
                </Typography>

                <Typography color="text.secondary" sx={{ lineHeight: 1.8 }}>
                  A área de agendamentos permite registrar exames, consultar horários futuros
                  e acompanhar o status de cada atendimento.
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>

          {/* Card de Laudos */}
          <Card
            id="laudos"
            sx={{
              borderRadius: 4,
              border: "1px solid rgba(84, 172, 75, 0.18)",
              transition: "all 0.2s ease",
              "&:hover": {
                borderColor: "#54AC4B",
                boxShadow: "0 8px 24px rgba(84, 172, 75, 0.14)",
                transform: "translateY(-2px)",
              },
            }}
          >
            <CardActionArea
              onClick={() => navigate("/laudos")}
              sx={{ height: "100%" }}
            >
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h5" fontWeight={800} gutterBottom>
                  Laudos
                </Typography>

                <Typography color="text.secondary" sx={{ lineHeight: 1.8 }}>
                  A seção de laudos permite criar rascunhos, publicar resultados e
                  consultar somente os exames com laudo liberado.
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Stack>
      </Container>
    </Box>
  );
}