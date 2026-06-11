/**
 * Campos canónicos de Distro a los que el usuario mapea sus columnas de Excel.
 * El mapeo (columna_excel → campo_distro) se guarda en `column_mappings`.
 */

export type CampoDistro =
  | "fecha_venta"
  | "monto"
  | "id_cliente"
  | "nombre_cliente"
  | "zona"
  | "id_vendedor"
  | "nombre_vendedor"
  | "categoria"
  | "tipo";

export interface CampoDef {
  campo: CampoDistro;
  label: string;
  requerido: boolean;
  /** Transformación por defecto sugerida al mapear. */
  transformacion: "none" | "fecha" | "monto" | "uppercase" | "trim" | "tipo_venta";
  descripcion: string;
}

export const CAMPOS_DISTRO: CampoDef[] = [
  {
    campo: "fecha_venta",
    label: "Fecha de venta",
    requerido: true,
    transformacion: "fecha",
    descripcion: "Fecha de la transacción. Acepta múltiples formatos.",
  },
  {
    campo: "monto",
    label: "Monto / Importe",
    requerido: true,
    transformacion: "monto",
    descripcion: "Importe de la venta. Negativo o tipo marcan devolución.",
  },
  {
    campo: "id_cliente",
    label: "Código de cliente",
    requerido: false,
    transformacion: "trim",
    descripcion: "Identificador externo del cliente (código del ERP).",
  },
  {
    campo: "nombre_cliente",
    label: "Nombre / Razón social",
    requerido: true,
    transformacion: "trim",
    descripcion: "Usado para deduplicar clientes entre cargas.",
  },
  {
    campo: "zona",
    label: "Zona",
    requerido: false,
    transformacion: "trim",
    descripcion: "Zona geográfica/comercial; mejora el matching de clientes.",
  },
  {
    campo: "id_vendedor",
    label: "Código de vendedor",
    requerido: false,
    transformacion: "trim",
    descripcion: "Identificador del vendedor asignado.",
  },
  {
    campo: "nombre_vendedor",
    label: "Nombre de vendedor",
    requerido: false,
    transformacion: "trim",
    descripcion: "Alternativa al código de vendedor.",
  },
  {
    campo: "categoria",
    label: "Categoría / Rubro",
    requerido: false,
    transformacion: "trim",
    descripcion: "Producto o rubro; alimenta los comparativos por rubro.",
  },
  {
    campo: "tipo",
    label: "Tipo de comprobante",
    requerido: false,
    transformacion: "tipo_venta",
    descripcion: "Si existe: venta / devolución / nota de crédito.",
  },
];

export const CAMPOS_REQUERIDOS = CAMPOS_DISTRO.filter((c) => c.requerido).map(
  (c) => c.campo,
);

export function getCampoDef(campo: string): CampoDef | undefined {
  return CAMPOS_DISTRO.find((c) => c.campo === campo);
}
