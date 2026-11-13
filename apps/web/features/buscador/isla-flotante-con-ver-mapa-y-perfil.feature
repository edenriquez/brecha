# language: es
Característica: Isla flotante con "Ver mapa" y perfil
  Para alternar entre lista y mapa y llegar a mi cuenta sin encabezado
  Como persona que usa el explorador en teléfono
  Quiero una isla flotante inferior con el botón de vista y mi perfil

  Antecedentes:
    Dado que uso un teléfono
    Y estoy en la página principal del explorador

  Escenario: La isla ofrece "Ver mapa" cuando veo la lista
    Dado que veo la lista de rutas
    Entonces la isla inferior muestra el botón "Ver mapa"

  Escenario: La isla ofrece "Ver lista" cuando veo el mapa
    Dado que veo el mapa
    Cuando miro la isla inferior
    Entonces la isla muestra el botón "Ver lista"

  Escenario: La isla incluye mi avatar cuando tengo sesión
    Dado que tengo la sesión iniciada
    Entonces la isla inferior muestra mi avatar junto al botón de vista

  Escenario: El avatar de la isla abre el menú del perfil con Subir ruta y Mis salidas
    Dado que tengo la sesión iniciada
    Cuando toco mi avatar en la isla
    Entonces el menú muestra las opciones "Subir una ruta" y "Mis salidas"

  Escenario: Sin sesión la isla ofrece "Entrar"
    Dado que no he iniciado sesión
    Entonces la isla inferior muestra "Entrar" en lugar del avatar

  Escenario: En la lista la isla se esconde al desplazarme hacia abajo
    Dado que veo la lista de rutas
    Cuando me desplazo hacia abajo
    Entonces la isla inferior se esconde

  Escenario: En la lista la isla reaparece al desplazarme hacia arriba
    Dado que veo la lista de rutas y la isla está escondida
    Cuando me desplazo hacia arriba
    Entonces la isla inferior aparece

  Escenario: En el mapa la isla siempre está visible
    Dado que veo el mapa
    Cuando arrastro el mapa en cualquier dirección
    Entonces la isla inferior sigue visible
