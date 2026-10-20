-- Rutas populares del centro de México para arrancar el mapa. Puntos de inicio aproximados;
-- las portadas viven en apps/web/public/rutas hasta que la comunidad suba fotos propias.

insert into public.routes
  (slug, name, place_label, description, difficulty, route_type, distance_km, elevation_gain_m, duration_min, start_point, cover_url, tags, status)
values
  ('cumbre-del-tepozteco', 'Cumbre del Tepozteco', 'Tepoztlán, Mor.',
   'Escalinata de piedra entre bosque tropical seco hasta la pirámide del Tepozteco. Mejor temprano, antes del calor y la gente.',
   'moderada', 'ida_vuelta', 2.4, 400, 120,
   extensions.st_setsrid(extensions.st_makepoint(-99.0960, 18.9893), 4326)::extensions.geography,
   '/rutas/cumbre-del-tepozteco.jpg', array['cumbre', 'arqueologia'], 'publicada'),

  ('pico-del-aguila-ajusco', 'Pico del Águila – Ajusco', 'Tlalpan, CDMX',
   'La cumbre más alta de la Ciudad de México (3,930 m) entre bosque de pino y zacatonal.',
   'dificil', 'circular', 9.8, 780, 300,
   extensions.st_setsrid(extensions.st_makepoint(-99.2580, 19.2135), 4326)::extensions.geography,
   null, array['cumbre', 'bosque'], 'publicada'),

  ('los-dinamos-cuarto-dinamo', 'Los Dinamos – Cuarto Dinamo', 'Magdalena Contreras, CDMX',
   'Sendero junto al río Magdalena, entre bosque de oyamel, del Primer al Cuarto Dinamo.',
   'facil', 'ida_vuelta', 7.2, 350, 180,
   extensions.st_setsrid(extensions.st_makepoint(-99.2650, 19.2940), 4326)::extensions.geography,
   '/rutas/los-dinamos-cuarto-dinamo.jpg', array['bosque', 'rio'], 'publicada'),

  ('nevado-de-toluca-pico-del-fraile', 'Nevado de Toluca – Pico del Fraile', 'Zinacantepec, Edomex',
   'Cráter con las lagunas del Sol y de la Luna y subida al Pico del Fraile por la arista.',
   'dificil', 'ida_vuelta', 11.0, 900, 360,
   extensions.st_setsrid(extensions.st_makepoint(-99.7740, 19.1240), 4326)::extensions.geography,
   '/rutas/nevado-de-toluca-pico-del-fraile.jpg', array['cumbre', 'alta-montana', 'lagunas'], 'publicada'),

  ('la-joyita-portillo-3', 'La Joyita – Portillo 3', 'Amecameca, Edomex',
   'Aclimatación clásica en el Iztaccíhuatl: zacatonal y arenales desde La Joya hasta el tercer portillo.',
   'dificil', 'ida_vuelta', 5.5, 600, 180,
   extensions.st_setsrid(extensions.st_makepoint(-98.6533, 19.1915), 4326)::extensions.geography,
   '/rutas/la-joyita-portillo-3.jpg', array['alta-montana'], 'publicada'),

  ('cascada-dos-aguas', 'Cascada Dos Aguas', 'Tlalmanalco, Edomex',
   'Bosque húmedo, puentes colgantes y cascadas en el parque Dos Aguas.',
   'moderada', 'ida_vuelta', 8.1, 300, 165,
   extensions.st_setsrid(extensions.st_makepoint(-98.7300, 19.1960), 4326)::extensions.geography,
   '/rutas/cascada-dos-aguas.jpg', array['cascada', 'bosque'], 'publicada')
on conflict (slug) do nothing;
