import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Avatar,
  Typography,
  Stack,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  InputBase,
  Button,
  Alert,
} from "@mui/material";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import { login as loginRequest } from "./api";
import { setAuthSession } from "./auth";
import "./login.css";

type UserRole = "patient" | "professional";
type LoginLocationState = { from?: string };

export default function LoginPage() {
  const [role, setRole] = useState<UserRole>("patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const session = await loginRequest(email, password);

      if (session.user.role !== role) {
        throw new Error(
          `O usuário informado é do tipo "${session.user.role}", mas você selecionou "${role}".`
        );
      }

      setAuthSession(session);

      const state = location.state as LoginLocationState | null;
      const destination = state?.from ?? "/";

      navigate(destination, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box component="main" className="login-page">
      <Paper component="section" elevation={0} className="login-card" aria-label="Tela de login">
        <Stack spacing={0}>
          <Box className="login-brand">
            <Avatar variant="rounded" className="login-logo">
              <LocalHospitalIcon />
            </Avatar>

            <Box>
              <Typography component="h1">Clínica</Typography>
              <Typography component="p">Sistema de acesso</Typography>
            </Box>
          </Box>

          <Typography component="h2">Entrar</Typography>

          <Typography component="p" className="login-subtitle">
            Acesse como paciente ou profissional para continuar.
          </Typography>

          {error ? (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          ) : null}

          <Box component="form" className="login-form" onSubmit={handleSubmit}>
            <FormControl component="fieldset" className="role-selector">
              <FormLabel component="legend">Tipo de usuário</FormLabel>

              <RadioGroup
                name="role"
                value={role}
                onChange={(_, value) => setRole(value as UserRole)}
              >
                <FormControlLabel
                  value="patient"
                  control={
                    <Radio
                      sx={{
                        color: "#54AC4B",
                        "&.Mui-checked": { color: "#54AC4B" },
                      }}
                    />
                  }
                  label="Paciente"
                  className={`role-option ${role === "patient" ? "active" : ""}`}
                />

                <FormControlLabel
                  value="professional"
                  control={
                    <Radio
                      sx={{
                        color: "#54AC4B",
                        "&.Mui-checked": { color: "#54AC4B" },
                      }}
                    />
                  }
                  label="Profissional"
                  className={`role-option ${role === "professional" ? "active" : ""}`}
                />
              </RadioGroup>
            </FormControl>

            <Box className="form-field">
              <Typography component="span">E-mail</Typography>

              <InputBase 
                inputProps={{ "aria-label": "E-mail" }}
                type="email"
                placeholder="seuemail@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                fullWidth
              />
            </Box>

            <Box className="form-field">
              <Typography component="span">Senha</Typography>

              <InputBase
                inputProps={{ "aria-label": "Senha" }}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                fullWidth
              />
            </Box>

            <Button
              type="submit"
              variant="contained"
              className="login-button"
              fullWidth
              disableElevation
              disabled={loading}
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}