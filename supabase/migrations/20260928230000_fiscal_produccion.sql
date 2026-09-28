-- Facturación en producción (plan Pro de Afip SDK): las altas nuevas de ARCA emiten comprobantes
-- reales. Las organizaciones ya conectadas en modo prueba siguen en prueba (su credencial guarda
-- el ambiente con el que se dio de alta).
UPDATE fiscal_parametros SET ambiente_nuevo = 'prod' WHERE id = 1;

-- Comprobantes A y B emitidos antes de guardar el detalle por alícuota: se completa con lo que se
-- le envió a ARCA, para que entren en el Libro IVA Digital
UPDATE fiscal_comprobantes
SET alicuotas = raw_request::jsonb #> '{FeDetReq,FECAEDetRequest,Iva,AlicIva}'
WHERE (alicuotas IS NULL OR alicuotas::text = '[]')
  AND tipo_cbte IN (1, 2, 3, 6, 7, 8)
  AND jsonb_typeof(raw_request::jsonb #> '{FeDetReq,FECAEDetRequest,Iva,AlicIva}') = 'array';
