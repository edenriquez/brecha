# language: es
Característica: Usar mi ubicación
  Para ver rutas cerca de donde estoy
  Como persona que explora rutas de hiking
  Quiero usar mi ubicación actual como lugar de búsqueda

  Antecedentes:
    Dado que estoy en la página principal del explorador
    Y la hoja de búsqueda está abierta

  Escenario: La opción de ubicación está al pie de la hoja
    Entonces al pie de la hoja veo "Usar mi ubicación actual"

  Escenario: La ubicación no se pide hasta que toco la opción
    Entonces el navegador no ha pedido mi ubicación

  Escenario: Con permiso concedido la lista muestra rutas cercanas y la barra dice "Cerca de ti"
    Dado que concedo el permiso de ubicación
    Cuando toco "Usar mi ubicación actual"
    Entonces la hoja se cierra
    Y la barra muestra "Cerca de ti"
    Y la lista muestra las rutas cercanas a mi posición

  Escenario: Con permiso concedido veo el punto azul en el mapa
    Dado que concedo el permiso de ubicación
    Cuando toco "Usar mi ubicación actual"
    Y miro el mapa
    Entonces el mapa está centrado en mi posición
    Y veo el punto azul de mi ubicación

  Escenario: Con el permiso negado se avisa y nada cambia
    Dado que niego el permiso de ubicación
    Cuando toco "Usar mi ubicación actual"
    Entonces veo "No pudimos leer tu ubicación; elige un lugar arriba"
    Y la hoja sigue abierta
    Y la búsqueda no cambia

  Escenario: Sin soporte de ubicación en el navegador se avisa y nada cambia
    Dado que mi navegador no soporta la ubicación
    Cuando toco "Usar mi ubicación actual"
    Entonces veo "No pudimos leer tu ubicación; elige un lugar arriba"
    Y la búsqueda no cambia

  Escenario: Si la ubicación falla no aparece el punto azul
    Dado que niego el permiso de ubicación
    Cuando toco "Usar mi ubicación actual"
    Y miro el mapa
    Entonces no veo el punto azul
