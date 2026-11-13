# language: es
Característica: Buscar por texto y elegir una ruta
  Para encontrar una ruta concreta
  Como persona que explora rutas de hiking
  Quiero buscar por texto o abrir una ruta sugerida

  Antecedentes:
    Dado que estoy en la página principal del explorador
    Y la hoja de búsqueda está abierta

  Escenario: Enter sin elegir nada busca por texto
    Cuando escribo "volcán" y presiono Enter
    Entonces la hoja se cierra
    Y la barra muestra “volcán”
    Y la lista solo muestra rutas cuyo nombre, lugar o etiquetas coinciden con "volcán"

  Escenario: La búsqueda por texto sin coincidencias avisa que no hay rutas
    Cuando escribo "zzzz" y presiono Enter
    Entonces veo "Ninguna ruta coincide con tu búsqueda."

  Escenario: Elegir una ruta sugerida abre la página de esa ruta
    Cuando escribo parte del nombre de una ruta publicada
    Y elijo esa ruta bajo "Rutas"
    Entonces se abre la página de esa ruta
