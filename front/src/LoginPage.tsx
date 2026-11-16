import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { setAuthUser } from "./auth";
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
} from "@mui/material";

import "./login.css";

type UserRole = "patient" | "professional";

export default function LoginPage() {
  const [role, setRole] = useState<UserRole>("patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const mockUser =
      role === "patient"
        ? {
            name: "Paciente Teste",
            email,
            role,
          }
        : {
            name: "Dra. Ana Souza",
            email,
            role,
          };

    setAuthUser(mockUser);
    navigate("/");
  }

  return (
    <Box component="main" className="login-page">
      <Paper
        component="section"
        elevation={0}
        className="login-card"
        aria-label="Tela de login"
      >
        <Stack spacing={0}>
          {/* Identidade visual */}
          <Box className="login-brand">
            <Avatar variant="rounded" className="login-logo">
              C
            </Avatar>

            <Box>
              <Typography component="h1">
                Clínica
              </Typography>

              <Typography component="p">
                Sistema de acesso
              </Typography>
            </Box>
          </Box>

          {/* Título */}
          <Typography component="h2">
            Entrar
          </Typography>

          <Typography
            component="p"
            className="login-subtitle"
          >
            Acesse como paciente ou profissional para continuar.
          </Typography>

          {/* Formulário */}
          <Box
            component="form"
            className="login-form"
            onSubmit={handleSubmit}
          >
            {/* Tipo de usuário */}
            <FormControl
              component="fieldset"
              className="role-selector"
            >
              <FormLabel component="legend">
                Tipo de usuário
              </FormLabel>

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
                        "&.Mui-checked": {
                          color: "#54AC4B",
                        },
                      }}
                    />
                  }
                  label="Paciente"
                  className={`role-option ${
                    role === "patient" ? "active" : ""
                  }`}
                />

                <FormControlLabel
                  value="professional"
                  control={
                    <Radio
                      sx={{
                        color: "#54AC4B",
                        "&.Mui-checked": {
                          color: "#54AC4B",
                        },
                      }}
                    />
                  }
                  label="Profissional"
                  className={`role-option ${
                    role === "professional" ? "active" : ""
                  }`}
                />
              </RadioGroup>
            </FormControl>

            {/* E-mail */}
            <Box className="form-field">
              <Typography component="span">
                E-mail
              </Typography>

              <InputBase
                type="email"
                placeholder="seuemail@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                fullWidth
              />
            </Box>

            {/* Senha */}
            <Box className="form-field">
              <Typography component="span">
                Senha
              </Typography>

              <InputBase
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                fullWidth
              />
            </Box>

            {/* Botão */}
            <Button
              type="submit"
              variant="contained"
              className="login-button"
              fullWidth
              disableElevation
              sx={{
                textTransform: "none",
                "&:hover": {
                  transform: "translateY(-1px)",
                },
                "&:active": {
                  transform: "translateY(0)",
                },
              }}
            >
              Entrar
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}