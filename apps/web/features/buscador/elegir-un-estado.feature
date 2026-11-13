# language: es
Característica: Elegir un estado
  Para ver rutas y mapa de un estado
  Como persona que explora rutas de hiking
  Quiero elegir un estado en la hoja de búsqueda

  Antecedentes:
    Dado que estoy en la página principal del explorador
    Y la hoja de búsqueda está abierta

  Esquema del escenario: Elegir un estado filtra la lista y rotula la barra
    Cuando elijo el estado "<estado>"
    Entonces la hoja se cierra
    Y la barra muestra "Todo <estado>"
    Y la lista solo muestra rutas de <estado>

    Ejemplos:
      | estado           |
      | Ciudad de México |
      | Estado de México |
      | Morelos          |
      | Puebla           |

  @escritorio
  Escenario: En escritorio, al elegir un estado el mapa visible queda situado en ese estado
    Dado que uso una computadora de escritorio y el mapa está a la vista
    Cuando elijo el estado "Morelos"
    Entonces el mapa que veo queda situado en Morelos

  @telefono
  Escenario: En teléfono, al abrir el mapa después de elegir un estado, el mapa queda situado en él
    Dado que uso un teléfono y veo la lista de rutas
    Cuando elijo el estado "Puebla"
    Y toco "Ver mapa"
    Entonces el mapa queda situado en Puebla

  Escenario: Un estado marcado como actual se señala en la hoja
    Dado que ya elegí el estado "Morelos"
    Cuando abro la hoja de búsqueda
    Entonces junto a "Morelos" veo "Actual"
