-- =====================================================
-- MIGRACIÓN: bg-tienda — bucket de imágenes de producto
-- Correr en Supabase SQL Editor
--
-- Sigue la misma convención que el bucket existente "organization-logos" (público), pero acá SÍ
-- se restringe la escritura por carpeta = organization_id, porque bg-tienda tiene organizaciones
-- clientes reales entre sí (no solo cuentas internas del dueño) y una tienda no debería poder
-- pisar las imágenes de otra. Paths esperados: <organization_id>/<archivo>.
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('store-product-images', 'store-product-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "store_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'store-product-images');

CREATE POLICY "store_images_org_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'store-product-images'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "store_images_org_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'store-product-images'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "store_images_org_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'store-product-images'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM users WHERE auth_id = auth.uid()
    )
  );
