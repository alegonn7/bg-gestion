-- Datos para imprimir los comprobantes (PDF) e identificar al comprador con DNI o CUIT.

-- Lo que se facturó, tal como se envió a ARCA
ALTER TABLE fiscal_comprobantes
  ADD COLUMN IF NOT EXISTS items     jsonb,        -- ítems facturados (descripción, cantidad, precio, alícuota)
  ADD COLUMN IF NOT EXISTS alicuotas jsonb,        -- IVA por alícuota: [{ Id, BaseImp, Importe }]
  ADD COLUMN IF NOT EXISTS doc_tipo  int,          -- 80 = CUIT, 96 = DNI, 99 = consumidor final sin identificar
  ADD COLUMN IF NOT EXISTS doc_nro   varchar(11);

-- Datos del emisor que exige la factura impresa
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS domicilio_comercial text,
  ADD COLUMN IF NOT EXISTS ingresos_brutos     text,
  ADD COLUMN IF NOT EXISTS inicio_actividades  date;
