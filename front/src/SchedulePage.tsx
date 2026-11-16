import { Box, Container, Typography } from "@mui/material";
import { getAuthUser } from "./auth";

export default function SchedulePage() {
  const user = getAuthUser();

  return (
    <Container sx={{ py: 4 }}>
      <Box>
        <Typography variant="h4" fontWeight={900} gutterBottom>
          Agendamentos
        </Typography>
        <Typography color="text.secondary">
          Bem-vindo, {user?.name}. Esta página será usada para listar e gerenciar agendamentos.
        </Typography>
      </Box>
    </Container>
  );
}