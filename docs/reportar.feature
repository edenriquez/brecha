# language: es
# Especificación de "Reportar" en el visor sin conexión (/descargas?ruta=<slug>).
# No hay un corredor de pruebas que la ejecute: es la referencia de cómo debe comportarse.
# Código: components/offline-routes.tsx (Viewer), lib/annotation-queue.ts, lib/offline.ts (fetchAnnotations).

Característica: Reportar tracción y avisos desde el visor
  Quien subió una ruta la recorre con el visor y marca, en el punto donde está parado,
  la tracción que hace falta "desde aquí" o un aviso (obstrucción, lodo o agua, paso difícil,
  chicken line, comentario). Funciona con o sin señal: lo capturado sin señal se guarda
  en el teléfono y sube solo al recuperarla.

  Antecedentes:
    Dado que la ruta "Cañada" tiene trazo y perfil de altitud
    Y que la ruta "Cañada" está guardada en el dispositivo

  # ---------------------------------------------------------------------------
  # Quién puede reportar
  # ---------------------------------------------------------------------------

  Esquema del escenario: El botón "Reportar" solo aparece para quien puede anotar la ruta
    Dado que abrí el visor con señal <sesión>
    Entonces el botón "Reportar" <resultado>

    Ejemplos:
      | sesión                                   | resultado   |
      | con la sesión de quien subió la ruta     | aparece     |
      | con una sesión de moderación             | aparece     |
      | con la sesión de otra persona            | no aparece  |
      | sin sesión                               | no aparece  |

  Escenario: Sin señal el visor recuerda si podía reportar
    Dado que abrí el visor con señal y con la sesión de quien subió la ruta
    Cuando vuelvo a abrir el visor sin señal
    Entonces el botón "Reportar" aparece

  Escenario: Una ruta descargada antes de existir "Reportar" lo gana al abrirla con señal
    Dado que el registro de la ruta en el dispositivo no dice si puedo anotarla
    Cuando abro el visor con señal y con la sesión de quien subió la ruta
    Entonces el botón "Reportar" aparece
    Y sigue apareciendo la siguiente vez que abro el visor sin señal

  Escenario: Una relectura a medias no me quita el botón
    Dado que el botón "Reportar" aparece
    Cuando el visor relee las anotaciones con señal débil y una de las consultas falla
    Entonces el botón "Reportar" sigue apareciendo

  @limite
  Escenario: Una ruta sin perfil de altitud no se puede reportar desde el visor
    Dado que la ruta "Llano" no tiene perfil de altitud
    Cuando abro su visor con la sesión de quien la subió
    Entonces el botón "Reportar" no aparece

  # ---------------------------------------------------------------------------
  # Dónde se marca
  # ---------------------------------------------------------------------------

  Escenario: El punto es una lectura nueva del GPS tomada al abrir la hoja
    Dado que estoy sobre el trazo en el km 3.7
    Cuando toco "Reportar"
    Entonces la hoja "Reportar aquí" pide una lectura nueva del GPS
    Y al llegar muestra "Km 3.7"

  Escenario: La última lectura conocida no sirve como punto
    Dado que el visor recibió una lectura del GPS en el km 1.2
    Y que después el teléfono estuvo bloqueado mientras avancé hasta el km 6.0
    Cuando desbloqueo el teléfono y toco "Reportar" de inmediato
    Entonces la hoja muestra "Buscando tu ubicación…" hasta tener una lectura nueva
    Y el punto queda en el km 6.0, no en el km 1.2

  Escenario: Con el GPS apagado, reportar lo prende y espera una lectura
    Dado que apagué el seguimiento del GPS con su botón
    Cuando toco "Reportar"
    Entonces el GPS se prende
    Y la hoja muestra "Buscando tu ubicación…"
    Y "Guardar" está deshabilitado hasta que llega la lectura

  Escenario: Sin permiso de ubicación la hoja lo dice
    Dado que el navegador tiene negado el permiso de ubicación
    Cuando toco "Reportar"
    Entonces la hoja dice que active el permiso de ubicación para reportar
    Y "Guardar" está deshabilitado

  Escenario: Si el GPS no da una lectura a tiempo se puede reintentar
    Dado que el GPS no entrega una lectura en 20 segundos
    Cuando toco "Reportar"
    Entonces la hoja dice que no pudo leer mi ubicación
    Y ofrece "Reintentar", que vuelve a pedir la lectura

  Escenario: El punto no se mueve mientras lleno la hoja
    Dado que abrí la hoja y muestra "Km 3.7"
    Cuando el vehículo avanza 200 m antes de que toque "Guardar"
    Entonces el reporte se guarda en el km 3.7

  Escenario: Cada vez que abro la hoja se toma un punto nuevo
    Dado que abrí la hoja en el km 3.7 y la cerré sin guardar
    Cuando avanzo al km 4.5 y toco "Reportar"
    Entonces la hoja muestra "Km 4.5" y ninguna opción elegida

  Escenario: Un poco fuera del sendero se marca el punto más cercano del trazo
    Dado que estoy a 80 m del trazo, frente al km 5.1
    Cuando toco "Reportar"
    Entonces la hoja avisa "Estás a 80 m del sendero: se marca el punto más cercano del trazo."
    Y el punto es el km 5.1

  Escenario: Lejos del sendero no se puede reportar
    Dado que estoy a más de 300 m del trazo
    Cuando toco "Reportar"
    Entonces la hoja dice a qué distancia estoy y que me acerque al sendero para reportar
    Y "Guardar" está deshabilitado

  Escenario: Se puede reportar sin haber comenzado la ruta
    Dado que no he tocado "Comenzar ruta"
    Cuando toco "Reportar" estando sobre el trazo
    Entonces la hoja muestra el km donde estoy

  Escenario: De regreso el km se cuenta sobre la ida
    Dado que la ruta mide 10.0 km y voy "De regreso" con 2.0 km regresados
    Cuando toco "Reportar"
    Entonces la hoja muestra "Km 8.0"

  # ---------------------------------------------------------------------------
  # Qué se marca
  # ---------------------------------------------------------------------------

  Escenario: Marcar la tracción desde este punto
    Dado que la hoja muestra "Km 3.7"
    Cuando elijo "4H" y toco "Guardar"
    Entonces la hoja se cierra
    Y el trazo se pinta de 4H desde el km 3.7 hasta la siguiente marca o el final

  Esquema del escenario: Marcar un aviso
    Dado que la hoja muestra "Km 3.7"
    Cuando elijo "<tipo>", escribo la nota "<nota>" y toco "Guardar"
    Entonces aparece en el mapa un pin de "<tipo>" en el km 3.7

    Ejemplos:
      | tipo         | nota                      |
      | Obstrucción  | Árbol caído               |
      | Lodo o agua  |                           |
      | Paso difícil | Escalón de roca           |
      | Chicken line | Desvío por la derecha     |
      | Comentario   | Buen lugar para comer     |

  Escenario: Una sola cosa por guardado
    Dado que elegí "4L"
    Cuando elijo "Obstrucción"
    Entonces "4L" deja de estar elegido

  Esquema del escenario: Cuándo se puede guardar
    Dado que la hoja tiene punto
    Cuando <estado de la hoja>
    Entonces "Guardar" está <guardar>

    Ejemplos:
      | estado de la hoja                               | guardar       |
      | no he elegido nada                              | deshabilitado |
      | elegí "Normal" sin nota                         | habilitado    |
      | elegí "Obstrucción" sin nota                    | habilitado    |
      | elegí "Comentario" sin nota                     | deshabilitado |
      | elegí "Comentario" con una nota de solo espacios | deshabilitado |
      | elegí "Comentario" con nota                     | habilitado    |

  Escenario: La nota no pasa de 280 caracteres
    Cuando escribo una nota de 300 caracteres
    Entonces el campo se queda con los primeros 280

  Escenario: De regreso no se marca tracción
    Dado que voy "De regreso"
    Cuando toco "Reportar"
    Entonces la hoja dice "La tracción se marca de ida."
    Y solo ofrece los cinco avisos

  Escenario: Corregir la tracción en el mismo lugar la reemplaza
    Dado que hay una marca de tracción "4L" en el km 5.10
    Cuando reporto "4H" parado a menos de 50 m de esa marca
    Entonces queda una sola marca de tracción en el km 5.10, con "4H"

  Escenario: Dos avisos pueden convivir en el mismo punto
    Dado que hay un aviso de "Obstrucción" en el km 5.1
    Cuando reporto "Lodo o agua" en el km 5.1
    Entonces hay dos pines en el km 5.1

  Escenario: Cerrar la hoja sin guardar no deja nada
    Dado que elegí "Obstrucción" y escribí una nota
    Cuando cierro la hoja
    Entonces no se guarda ningún reporte

  Escenario: La hoja de reportar no convive con las otras hojas
    Dado que la hoja de capas o el panel de avance están abiertos
    Cuando toco "Reportar"
    Entonces se cierran y se abre "Reportar aquí"

  # ---------------------------------------------------------------------------
  # Lo recién reportado en el visor
  # ---------------------------------------------------------------------------

  Escenario: Lo que acabo de reportar no me avisa a mí
    Dado que comencé la ruta
    Cuando reporto "Obstrucción" donde estoy
    Entonces no salta la tarjeta "Obstrucción aquí"

  Escenario: La tracción que acabo de marcar no me avisa a mí
    Dado que comencé la ruta
    Cuando reporto "4L" donde estoy
    Entonces no salta la tarjeta "Aquí empieza 4L"

  Escenario: Lo reportado se ve en el mapa antes de subir
    Cuando guardo un reporte
    Entonces se ve en el mapa de inmediato, haya o no señal

  # ---------------------------------------------------------------------------
  # Subida y cola sin señal
  # ---------------------------------------------------------------------------

  Escenario: Con señal el reporte sube al momento
    Dado que hay señal
    Cuando guardo un reporte
    Entonces queda en la base de datos
    Y sigue en el mapa, sin la píldora "por subir"

  Escenario: Sin señal el reporte espera en el teléfono
    Dado que no hay señal
    Cuando guardo un reporte
    Entonces el chip de la hoja decía "· sin señal"
    Y el visor muestra "1 por subir · se envían al tener señal"
    Y el reporte se ve en el mapa

  Escenario: Lo pendiente sobrevive a cerrar y abrir el visor sin señal
    Dado que tengo "2 por subir"
    Cuando cierro la app y vuelvo a abrir el visor sin señal
    Entonces el visor sigue mostrando "2 por subir" y los dos reportes en el mapa

  Escenario: Al volver la señal sube solo
    Dado que tengo "1 por subir"
    Cuando vuelve la señal
    Entonces el reporte sube sin que yo haga nada
    Y la píldora "por subir" desaparece

  Escenario: Sube aunque no vuelva a abrir el visor
    Dado que tengo "1 por subir" y cerré el visor
    Cuando abro cualquier página de Brecha con señal
    Entonces el reporte sube

  Escenario: Con señal débil se reintenta cada minuto
    Dado que el teléfono dice tener red pero la subida no recibe respuesta
    Cuando pasa un minuto con el visor abierto
    Entonces el visor vuelve a intentar la subida

  Escenario: Un reintento no duplica un aviso que sí había llegado
    Dado que subí un aviso y la respuesta del servidor no llegó
    Cuando el visor reintenta
    Entonces en la base hay un solo aviso

  Escenario: Cerrar la app a media subida no duplica el aviso
    Dado que el aviso llegó al servidor y cerré la app antes de que el teléfono lo anotara
    Cuando vuelvo a abrir Brecha con señal
    Entonces en la base hay un solo aviso

  Escenario: Lo recién subido no desaparece si falla la relectura
    Dado que mi reporte subió
    Cuando la relectura de anotaciones falla por señal débil
    Entonces el reporte sigue en el mapa

  Escenario: Un reporte subido que luego borré en el editor deja de verse
    Dado que mi reporte subió y sigue anotado en el teléfono como recién subido
    Y que lo borré desde el editor de escritorio
    Cuando abro el visor con señal
    Entonces el reporte ya no se ve en el mapa

  Escenario: Si el teléfono no deja guardar datos, el reporte no se pierde mientras la app siga abierta
    Dado que el navegador rechaza escribir en su almacenamiento
    Cuando guardo un reporte con señal
    Entonces el reporte sube igual

  # ---------------------------------------------------------------------------
  # Rechazos
  # ---------------------------------------------------------------------------

  Escenario: Reporte rechazado por no ser quien subió la ruta
    Dado que tengo un reporte por subir
    Y que la sesión actual no es de quien subió la ruta ni de moderación
    Cuando el visor intenta subirlo
    Entonces sale una tarjeta con el reporte y "Solo quien subió la ruta puede anotarla."
    Y ofrece "Descartar" y "Reintentar"
    Y el reporte no se reintenta solo

  Escenario: Reporte que espera a que inicie sesión
    Dado que tengo un reporte por subir
    Y que cerré mi sesión
    Cuando el visor intenta subirlo
    Entonces la tarjeta dice que inicie sesión para subirlo
    Y después de iniciar sesión, "Reintentar" lo sube

  Escenario: Descartar quita el reporte
    Dado que hay una tarjeta de reporte rechazado
    Cuando toco "Descartar"
    Entonces la tarjeta desaparece y el reporte ya no está en el mapa ni en el teléfono

  Escenario: Un rechazo no detiene a los demás
    Dado que tengo dos reportes por subir y el servidor rechaza el primero
    Cuando el visor sube la cola
    Entonces el segundo sube

  Escenario: La ruta ya no existe
    Dado que tengo un reporte por subir de una ruta que se borró
    Cuando el visor intenta subirlo
    Entonces la tarjeta dice que la ruta ya no existe y ofrece "Descartar"

  # ---------------------------------------------------------------------------
  # Dónde más aparece
  # ---------------------------------------------------------------------------

  Escenario: Lo reportado llega al editor y a la página de la ruta
    Dado que mi reporte subió
    Entonces aparece en el editor de anotaciones de la ruta
    Y aparece en la página pública de la ruta a más tardar 5 minutos después

  @limite
  Escenario: Desde el visor no se edita ni se borra
    Dado que reporté un aviso por error
    Entonces para corregirlo o borrarlo uso el editor de escritorio
