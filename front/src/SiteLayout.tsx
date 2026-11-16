import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  Chip,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { clearAuthSession, getAuthUser } from "./auth";

type SiteLayoutProps = {
  children: React.ReactNode;
};

export default function SiteLayout({ children }: SiteLayoutProps) {
  const navigate = useNavigate();
  const user = getAuthUser();

  function goTo(path: "/agendamentos" | "/laudos") {
    if (!user) {
      navigate("/login", { state: { from: path } });
      return;
    }

    navigate(path);
  }

  function goToLogin() {
    navigate("/login", { state: { from: "/" } });
  }

  function handleLogout() {
    clearAuthSession();
    navigate("/", { replace: true });
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
              onClick={() => goTo("/agendamentos")}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              Agendamentos
            </Button>

            <Button
              onClick={() => goTo("/laudos")}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              Laudos
            </Button>
          </Stack>

          <Box sx={{ minWidth: 140, display: "flex", justifyContent: "flex-end" }}>
            {user ? (
              <Stack alignItems="flex-end" spacing={0.25}>
                <Typography fontWeight={700}>{user.name}</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    size="small"
                    label={user.role === "patient" ? "Paciente" : "Profissional"}
                    sx={{
                      bgcolor: "rgba(84, 172, 75, 0.10)",
                      color: "#2f6f29",
                      fontWeight: 700,
                    }}
                  />
                  <Button
                    size="small"
                    onClick={handleLogout}
                    sx={{
                      textTransform: "none",
                      fontWeight: 700,
                      color: "#2f6f29",
                    }}
                  >
                    Sair
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Button
                variant="outlined"
                onClick={goToLogin}
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

      {children}
    </Box>
  );
}