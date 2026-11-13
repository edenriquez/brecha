# language: es
Característica: Enlaces compartidos y navegación
  Para compartir y volver a una búsqueda
  Como persona que recibe o guarda un enlace del explorador
  Quiero que la dirección conserve el lugar y el texto buscado

  Escenario: Un enlace con un estado válido abre el explorador filtrado por ese estado
    Dado que abro el enlace "/?lugar=17"
    Entonces la barra muestra "Todo Morelos"
    Y la lista solo muestra rutas de Morelos

  Escenario: Un enlace con "lugar=gps" vuelve a pedir la ubicación y muestra "Cerca de ti"
    Dado que concedo el permiso de ubicación
    Cuando abro el enlace "/?lugar=gps"
    Entonces la barra muestra "Cerca de ti"
    Y veo el punto azul de mi ubicación en el mapa

  Escenario: Si la ubicación no llega, un enlace con "lugar=gps" y zona conserva la zona sin punto azul
    Dado que niego el permiso de ubicación
    Cuando abro un enlace con "lugar=gps" y una zona
    Entonces la lista solo muestra rutas de esa zona
    Y no veo el punto azul
    Y no veo ningún aviso de ubicación

  Escenario: Un enlace con un lugar inválido se ignora en la barra
    Dado que abro el enlace "/?lugar=99999"
    Entonces la barra muestra "Busca un estado o el nombre de un cerro"
    Y no veo ningún chip de lugar

  Escenario: Un enlace con texto de búsqueda conserva el texto
    Dado que abro el enlace "/?q=volcán"
    Entonces la barra muestra “volcán”
    Y la lista solo muestra rutas que coinciden con "volcán"

  Escenario: Elegir un estado desde otra página lleva al explorador con ese lugar
    Dado que estoy en la página de una ruta
    Cuando abro la hoja de búsqueda y elijo "Puebla"
    Entonces la dirección pasa a ser "/" con el parámetro "lugar=21"
    Y la barra muestra "Todo Puebla"

  Escenario: Al elegir un estado la dirección del explorador se actualiza sin recargar
    Dado que estoy en la página principal del explorador
    Cuando elijo el estado "Morelos"
    Entonces la dirección incluye "lugar=17"

  Escenario: El botón atrás del navegador regresa al lugar elegido antes
    Dado que estoy en la página principal del explorador
    Y elegí el estado "Morelos"
    Y después elegí el estado "Puebla"
    Cuando toco el botón atrás del navegador
    Entonces la barra muestra "Todo Morelos"
    Y la lista solo muestra rutas de Morelos
