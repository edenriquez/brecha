# language: es
Característica: Hoja de búsqueda con solo estados
  Para elegir dónde buscar rutas
  Como persona que explora rutas de hiking
  Quiero una hoja que me ofrezca los estados disponibles

  Antecedentes:
    Dado que estoy en la página principal del explorador

  Escenario: Tocar la barra abre la hoja "Buscar un lugar"
    Cuando toco la barra de búsqueda
    Entonces se abre la hoja "Buscar un lugar"
    Y el campo de texto tiene el foco con el texto de ayuda "Estado o cerro"

  Escenario: La hoja lista solo los cuatro estados
    Cuando abro la hoja de búsqueda
    Entonces veo bajo "Estados" exactamente: Ciudad de México, Estado de México, Morelos y Puebla

  Escenario: Los estados no ofrecen entrar a sus municipios
    Cuando abro la hoja de búsqueda
    Entonces ningún estado tiene una flecha para ver sus municipios
    Y ningún estado indica cuántos municipios tiene

  Escenario: Al escribir no aparecen municipios
    Cuando abro la hoja de búsqueda
    Y escribo "tepoz"
    Entonces no veo ningún grupo "Municipios"

  Escenario: Al escribir se filtran los estados sin importar acentos ni mayúsculas
    Cuando abro la hoja de búsqueda
    Y escribo "MEXICO"
    Entonces veo los estados "Ciudad de México" y "Estado de México"
    Y no veo "Morelos" ni "Puebla"

  Escenario: Al escribir en el explorador se ofrecen también las rutas que coinciden
    Cuando abro la hoja de búsqueda
    Y escribo parte del nombre de una ruta publicada
    Entonces veo esa ruta bajo "Rutas"

  Escenario: Texto sin coincidencias muestra un aviso
    Cuando abro la hoja de búsqueda
    Y escribo "zzzz"
    Entonces veo "No encontramos “zzzz”. Busca un estado o el nombre de un cerro."

  Escenario: La hoja se cierra con el botón de cerrar
    Dado que la hoja de búsqueda está abierta
    Cuando toco "Cerrar"
    Entonces la hoja desaparece
    Y la búsqueda no cambia
