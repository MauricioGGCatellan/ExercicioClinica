import { useEffect, useState } from "react";

import {
  Fab,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from "@mui/material";

import AccessibilityNewIcon from "@mui/icons-material/AccessibilityNew";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import FormatLineSpacingIcon from "@mui/icons-material/FormatLineSpacing";
import CheckIcon from "@mui/icons-material/Check";

import "./accessibility.css";

const FONT_SCALES = [
  0.7,
  0.8,
  0.9,
  1.0,
  1.1,
  1.2,
  1.3,
];

export default function AccessibilityWidget() {
  const [fontLevel, setFontLevel] = useState(0);
  const [spacingEnabled, setSpacingEnabled] = useState(false);

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const open = Boolean(anchorEl);

  // Aplica as configurações globalmente.
  useEffect(() => {
    const root = document.documentElement;

    const fontScale = FONT_SCALES[fontLevel + 3];

    root.style.fontSize = `${fontScale * 100}%`;

    root.classList.toggle(
      "accessibility-spacing",
      spacingEnabled
    );
  }, [fontLevel, spacingEnabled]);

  // Remove as alterações caso o componente seja desmontado.
  useEffect(() => {
    return () => {
      const root = document.documentElement;

      root.style.removeProperty("font-size");
      root.classList.remove("accessibility-spacing");
    };
  }, []);

  function handleOpen(event: React.MouseEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget);
  }

  function handleClose() {
    setAnchorEl(null);
  }

  function increaseFont() {
    setFontLevel((current) => Math.min(current + 1, 3));
  }

  function decreaseFont() {
    setFontLevel((current) => Math.max(current - 1, -3));
  }

  function toggleSpacing() {
    setSpacingEnabled((current) => !current);
  }

  const fontDescription =
    fontLevel === 0
      ? "Tamanho padrão"
      : fontLevel > 0
        ? `Aumento ${fontLevel}/3`
        : `Redução ${Math.abs(fontLevel)}/3`;

  return (
    <>
      {/* Botão flutuante */}
      <Tooltip title="Opções de acessibilidade">
        <Fab
          onClick={handleOpen}
          aria-label="Abrir opções de acessibilidade"
          aria-controls={open ? "accessibility-menu" : undefined}
          aria-expanded={open ? "true" : undefined}
          aria-haspopup="menu"
          sx={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1300,

            width: 60,
            height: 60,

            bgcolor: "#54AC4B",
            color: "#FFFFFF",

            boxShadow: "0 5px 18px rgba(84, 172, 75, 0.35)",

            "&:hover": {
              bgcolor: "#3F8D38",
              boxShadow: "0 7px 22px rgba(84, 172, 75, 0.45)",
            },
          }}
        >
          <AccessibilityNewIcon fontSize="large" />
        </Fab>
      </Tooltip>

      {/* Menu de acessibilidade */}
      <Menu
        id="accessibility-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        slotProps={{
          paper: {
            sx: {
              mb: 1,
              minWidth: 250,
              borderRadius: 3,
              border: "1px solid rgba(84, 172, 75, 0.25)",
              boxShadow: "0 8px 28px rgba(0,0,0,0.12)",
            },
          },
        }}
      >
        {/* Aumentar fonte */}
        <MenuItem
          onClick={increaseFont}
          disabled={fontLevel >= 3}
          sx={{
            py: 1.5,
            "&:hover": {
              bgcolor: "#E8F5E6",
            },
          }}
        >
          <ListItemIcon>
            <AddIcon sx={{ color: "#54AC4B" }} />
          </ListItemIcon>

          <ListItemText
            primary="Aumentar fonte"
            secondary={fontDescription}
          />
        </MenuItem>

        {/* Diminuir fonte */}
        <MenuItem
          onClick={decreaseFont}
          disabled={fontLevel <= -3}
          sx={{
            py: 1.5,
            "&:hover": {
              bgcolor: "#E8F5E6",
            },
          }}
        >
          <ListItemIcon>
            <RemoveIcon sx={{ color: "#54AC4B" }} />
          </ListItemIcon>

          <ListItemText
            primary="Diminuir fonte"
            secondary={fontDescription}
          />
        </MenuItem>

        {/* Aumentar espaçamento */}
        <MenuItem
          onClick={toggleSpacing}
          selected={spacingEnabled}
          sx={{
            py: 1.5,
            "&:hover": {
              bgcolor: "#E8F5E6",
            },
            "&.Mui-selected": {
              bgcolor: "#E8F5E6",
            },
          }}
        >
          <ListItemIcon>
            {spacingEnabled ? (
              <CheckIcon sx={{ color: "#54AC4B" }} />
            ) : (
              <FormatLineSpacingIcon sx={{ color: "#54AC4B" }} />
            )}
          </ListItemIcon>

          <ListItemText
            primary="Aumentar espaçamento"
            secondary={
              spacingEnabled
                ? "Ativado — clique para restaurar"
                : "Desativado"
            }
          />
        </MenuItem>
      </Menu>
    </>
  );
}