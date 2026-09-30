-- Datos de prueba (el usuario admin se crea después con un script, por el hash de la contraseña)
INSERT INTO servicios (nombre, descripcion, duracion_min, precio) VALUES
  ('Corte de pelo',       'Corte con lavado',            30, 12000),
  ('Corte y barba',       'Corte + perfilado de barba',  45, 16000),
  ('Color',               'Coloración completa',        90, 35000),
  ('Brushing',            'Lavado y brushing',           30,  9000),
  ('Mechas',              'Mechas / reflejos',          120, 45000);

INSERT INTO profesionales (nombre, color) VALUES
  ('Laura',  '#ec4899'),
  ('Martín', '#0ea5e9');

-- Laura hace todo; Martín solo cortes, barba y brushing
INSERT INTO profesional_servicios (profesional_id, servicio_id) VALUES
  (1,1),(1,2),(1,3),(1,4),(1,5),
  (2,1),(2,2),(2,4);

-- Martes a sábado, 9 a 13 y 14 a 19 (dia_semana: 2..6)
INSERT INTO horarios (profesional_id, dia_semana, hora_inicio, hora_fin)
SELECT p.id, d, t.ini, t.fin
FROM profesionales p
CROSS JOIN generate_series(2, 6) AS d
CROSS JOIN (VALUES ('09:00'::time, '13:00'::time), ('14:00'::time, '19:00'::time)) AS t(ini, fin);
