import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta de marca de la landing (acento ocre cálido).
        accent: {
          DEFAULT: "#BA7517",
          dark: "#854F0B",
          light: "#FAEEDA",
        },
        // Mapeamos la escala `brand-*` (usada por los componentes de la app) a
        // los tonos ocre, para compartir identidad con la landing sin renombrar.
        brand: {
          50: "#FAEEDA",
          100: "#F5E2C4",
          200: "#EFD2A1",
          300: "#EF9F27", // hover de tarjetas en la landing
          400: "#D98A1D",
          500: "#BA7517", // accent
          600: "#A9690F", // botón primario
          700: "#854F0B", // accent-dark / hover
        },
        // Neutros cálidos (reemplazan al gris frío por defecto de Tailwind).
        gray: {
          50: "#f5f4f0",
          100: "#eceae3",
          200: "#dedbd2",
          300: "#c9c5b8",
          400: "#a8a499",
          500: "#6b6a65",
          600: "#55544f",
          700: "#3f3e3a",
          800: "#2a2926",
          900: "#1a1a18",
        },
        health: {
          estrella: "#7c3aed",
          crecimiento: "#16a34a",
          estable: "#0ea5e9",
          riesgo: "#BA7517",
          dormido: "#dc2626",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        md: "8px",
        lg: "12px",
        xl: "14px",
      },
    },
  },
  plugins: [],
};

export default config;
