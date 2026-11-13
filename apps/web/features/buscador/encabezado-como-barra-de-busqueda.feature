# language: es
Característica: Encabezado como barra de búsqueda
  Para llegar rápido a donde quiero caminar
  Como persona que explora rutas de hiking
  Quiero que el encabezado de todas las páginas sea la barra de búsqueda

  Antecedentes:
    Dado que estoy en la página principal del explorador

  @telefono
  Escenario: En teléfono el encabezado es solo la barra de búsqueda
    Dado que uso un teléfono
    Entonces el encabezado muestra únicamente la barra de búsqueda
    Y la barra ocupa todo el ancho del encabezado

  @telefono
  Escenario: En teléfono el encabezado no muestra logo, enlaces ni perfil
    Dado que uso un teléfono
    Entonces no veo el logo en el encabezado
    Y no veo enlaces de navegación en el encabezado
    Y no veo el perfil en el encabezado

  @escritorio
  Escenario: En escritorio el encabezado conserva logo, enlaces y perfil
    Dado que uso una computadora de escritorio
    Entonces el encabezado muestra el logo, los enlaces y el perfil
    Y la barra de búsqueda ocupa el espacio libre entre ellos

  Escenario: La barra invita a buscar cuando no hay ningún filtro
    Entonces la barra muestra "¿A dónde quieres caminar?"
    Y debajo muestra "Busca un estado o el nombre de un cerro"

  @telefono
  Esquema del escenario: En teléfono las demás páginas llevan el mismo encabezado
    Dado que uso un teléfono
    Cuando abro <página>
    Entonces el encabezado muestra únicamente la barra de búsqueda
    Y la barra ocupa todo el ancho del encabezado

    Ejemplos:
      | página                   |
      | la página de una ruta    |
      | la página de una salida  |
      | mi perfil                |
      | mis rutas guardadas      |
      | mis salidas              |
      | las reglas               |

  Escenario: Fuera del explorador, elegir un lugar en la barra lleva al mapa
    Dado que abro mis rutas guardadas
    Cuando elijo un estado en la barra de búsqueda
    Entonces llego al explorador con ese estado elegido
