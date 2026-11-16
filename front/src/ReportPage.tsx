import { Box, Container, Typography } from "@mui/material";
import { getAuthUser } from "./auth";

export default function ReportPage() {
  const user = getAuthUser();

  return (
    <Container sx={{ py: 4 }}>
      <Box>
        <Typography variant="h4" fontWeight={900} gutterBottom>
          Laudos
        </Typography>
        <Typography color="text.secondary">
          Bem-vindo, {user?.name}. Esta página será usada para consultar e publicar laudos.
        </Typography>
      </Box>
    </Container>
  );
}