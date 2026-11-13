# language: es
Característica: Quitar el lugar y limpiar filtros
  Para volver a ver todas las rutas
  Como persona que explora rutas de hiking
  Quiero quitar el lugar elegido

  Antecedentes:
    Dado que estoy en la página principal del explorador

  Escenario: Quitar el chip del lugar devuelve todas las rutas
    Dado que elegí el estado "Morelos"
    Cuando quito el chip del lugar
    Entonces la lista muestra todas las rutas
    Y la barra vuelve a mostrar "Busca un estado o el nombre de un cerro"

  Escenario: "Limpiar filtros" devuelve todas las rutas
    Dado que elegí el estado "Morelos"
    Cuando toco "Limpiar filtros"
    Entonces la lista muestra todas las rutas

  Escenario: Quitar el lugar elegido con mi ubicación borra el punto azul
    Dado que usé mi ubicación actual
    Cuando quito el chip del lugar
    Entonces el punto azul desaparece del mapa

  Escenario: "Limpiar filtros" también borra el punto azul
    Dado que usé mi ubicación actual
    Cuando toco "Limpiar filtros"
    Entonces el punto azul desaparece del mapa
