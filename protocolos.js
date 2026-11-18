/* =====================================================================================
   protocolos.js — TODO el contenido editable del Simulador 107

   Acá vive lo que el operador sabe, lo que pregunta, cómo reconoce cada tipo de llamada
   y con qué vara se corrige. No hay escenarios prediseñados: el alumno cuenta el caso
   que le dio su instructor (o el que inventó) y el operador se adapta.

   Es un script clásico: sin import/export, sin pantalla, sin estado de la llamada y sin
   reloj. Sólo datos y funciones puras. Lo cargan index.html, panel.html y
   fundamentos.html con <script src="/protocolos.js"></script> ANTES de su propio script,
   y las pruebas de Node lo leen y lo evalúan con new Function(fuente + "\nreturn PROTOCOLOS;").

   OJO con los nombres: todo lo que se declara acá arriba de todo queda global en el
   navegador. Si otra página declara un `const` con el mismo nombre, esa página no arranca.
   Por eso lo interno de la detección está encerrado en DETECTOR y no suelto.

   Orden del archivo:
     1. Rúbricas (CHECKS, CHECKS_LEGO y los criterios sueltos)
     2. Cómo atiende el operador (APERTURA, GLOSARIO, CONTEXTO y sus versiones lego)
     3. La RCP guiada por teléfono (RCP_*)
     4. Qué tiene que averiguar (ESENCIALES, EXTRAS) y los topes de la llamada
     5. El teclado (NUMEROS) y las pistas de ubicación
     6. CASOS: la tabla de tipos de llamada
     7. Las funciones: detección del caso, del paro y de la víctima; rúbrica y puntaje
   ===================================================================================== */

/* ---------------- rúbrica ----------------
   `peso` es cuánto suma cada criterio sobre 100. El puntaje lo calcula la app,
   NO lo decide el modelo: así una llamada mala no puede zafar con un número
   generoso. `critico:true` = sin ese dato no sale el móvil; si falta, el puntaje
   queda topeado en TOPE_CRITICO por más que todo lo demás esté bien.
   `logrado` y `parcial` son la vara con la que corrige el evaluador, para que no
   improvise distinto en cada práctica. Los pesos no tienen que sumar 100: puntuar()
   normaliza, porque cada tipo de caso agrega los suyos.
   Esta es la rúbrica del GUARDAVIDAS. La de la persona sin formación es CHECKS_LEGO,
   más abajo. El fundamento de cada criterio está en fundamentos.html.
   El texto de `material` habla del DEA porque es lo que más pesa en el agua y en el paro;
   los casos donde el DEA no viene a cuento lo reemplazan con `cambia.material`. */
const CHECKS = [
  {id:"ubicacion", label:"Ubicación exacta y cómo llegar", peso:20, critico:true,
   logrado:"Dio calle y altura, o una referencia que un móvil puede buscar sin volver a preguntar, MÁS por dónde se entra: portón, bajada, número de puesto, piso.",
   parcial:"Dio una referencia aproximada que todavía obliga al operador a repreguntar, o dijo el lugar pero no cómo se entra."},

  {id:"motivo", label:"Qué pasó, en una frase", peso:10, critico:false,
   logrado:"En las primeras frases se entiende el tipo de emergencia: lo sacó del agua, se desplomó, se golpeó.",
   parcial:"Se entiende recién después de que el operador repregunta, o quedó en una etiqueta vaga como 'se descompensó'."},

  {id:"victimas", label:"Cuántas víctimas y edad aproximada", peso:8, critico:false,
   logrado:"Dijo cuántas personas son y una edad aproximada de cada una.",
   parcial:"Dijo una cosa y no la otra, o tardó en aclarar que había más de una víctima."},

  {id:"estado", label:"Si responde y si respira", peso:15, critico:true,
   logrado:"Dijo si responde y si respira normalmente, en términos observables. Si hay boqueo o respiración agónica, lo transmitió como que NO respira.",
   parcial:"Dio sólo una de las dos cosas, o se escudó en una etiqueta ('está en paro', 'está mal') sin el dato observable detrás."},

  {id:"material", label:"Qué material tienen en el lugar, sobre todo el DEA", peso:10, critico:false,
   logrado:"Dijo con qué cuentan: si hay DEA y si está colocado, y si tienen bolsa-válvula-máscara, mascarilla de bolsillo u otro equipamiento. Si NO hay DEA, también lo dijo, que es lo que cambia el despacho. (El oxígeno no se le pide: en Argentina no está en el alcance del guardavidas.)",
   parcial:"Habló del material sólo cuando se lo preguntaron y sin precisar, o no aclaró si el DEA estaba puesto."},

  {id:"riesgos", label:"Riesgos y accesos para el móvil", peso:8, critico:false,
   logrado:"Avisó con qué se va a encontrar el móvil: gente alrededor, agua, tránsito, portón cerrado, escaleras, y quién lo va a estar esperando.",
   parcial:"Mencionó algo al pasar, sin que sirva para preparar la llegada."},

  {id:"identificacion", label:"Quién llama y teléfono de contacto", peso:7, critico:false,
   logrado:"Dio su nombre, aclaró que es guardavidas y dejó un teléfono de retorno.",
   parcial:"Dio el nombre pero no el rol, o no dejó teléfono."},

  /* Antes era "siguió las indicaciones". Se cambió cuando el operador dejó de dar
     indicaciones: ahora lo que se evalúa es si el alumno es una buena fuente de datos. */
  {id:"indicaciones", label:"Contestó concreto lo que le preguntaron", peso:10, critico:false,
   logrado:"Respondió con el dato que le pedían, sin evadir ni irse por las ramas, y avisó por su cuenta cuando algo cambió.",
   parcial:"Contestó a medias, o hizo esperar al operador repitiendo cosas que ya había dicho."},

  {id:"cierre", label:"No cortó antes que el operador", peso:8, critico:false,
   logrado:"Se mantuvo en línea hasta que el operador cerró, y quedó claro quién espera al móvil.",
   parcial:"Cortó una vez despachado, pero sin que el operador cerrara la llamada."},

  {id:"comunicacion", label:"Habló claro y sin divagar", peso:10, critico:false,
   logrado:"Frases cortas, una idea por vez, sin gritar y sin perderse en detalles que no cambian el despacho.",
   parcial:"Se entendió, pero con vueltas, repeticiones o datos irrelevantes que demoraron el despacho."}
];

/* Sin ubicación no llega el móvil; sin estado de la víctima no se decide el
   recurso ni se arranca la RCP guiada. Si falta alguno, el puntaje no pasa de acá. */
const TOPE_CRITICO = 40;

/* ---------------- rúbrica de la persona sin formación (modo lego) ----------------
   Para los cursos de RCP y primeros auxilios. Acá el operador SÍ guía: las guías
   indican que el despachador dé instrucciones de RCP a quien llama (AHA 2025, clase 1
   nivel A; ERC 2025), así que lo que se evalúa es si el alumno da la ubicación, dice
   con honestidad lo que ve y sigue la RCP guiada. No se le exige vocabulario técnico.
   Los dos críticos son los que, si faltan, dejan a la víctima sin ambulancia o sin RCP:
   sin ubicación no sale el móvil, y si dice que respira cuando no es así, el operador
   no le indica RCP.
   Estos diez (suman 100) son la rúbrica de una llamada CON paro. Sin paro, rubrica()
   saca los tres de la RCP (`rcp`, `dea`, `altavoz`), cambia el texto de `ayuda` y suma
   CHECK_INDICACIONES_LEGO y los criterios propios del caso. */
const CHECKS_LEGO = [
  {id:"ubicacion", label:"Dónde es, para que llegue la ambulancia", peso:20, critico:true,
   logrado:"Dio algo que una ambulancia puede encontrar sin volver a preguntar: calle y altura, o un lugar conocido con una referencia, y la localidad o el barrio. Si no sabía la dirección, la armó con referencias (ruta, comercio, cartel, color del portón) o la consiguió preguntando.",
   parcial:"Dio una referencia aproximada que obligó al operador a repreguntar, o la dio recién después de varias preguntas."},

  {id:"motivo", label:"Qué pasó, con lo que vio", peso:8, critico:false,
   logrado:"En las primeras frases se entiende qué pasó, contado con lo que vio: se desplomó, lo sacaron del agua, no reacciona.",
   parcial:"Se entendió recién cuando el operador insistió, o dio un diagnóstico ('le dio un infarto') en vez de lo que vio."},

  {id:"conciencia", label:"Si responde", peso:10, critico:false,
   logrado:"Dijo si la persona responde o no cuando le hablan o la tocan.",
   parcial:"Lo dijo con dudas, o recién cuando se lo preguntaron más de una vez."},

  {id:"respiracion", label:"Si respira normalmente, contado con honestidad", peso:15, critico:true,
   logrado:"Dijo si respira normalmente describiendo lo que ve. Si boqueaba, roncaba o hacía ruidos raros, lo contó así, sin decir que respiraba bien. Si no sabía, lo dijo en vez de inventar.",
   parcial:"Dijo 'respira' o 'no sé' sin describir lo que veía, o tardó mucho en contestarlo."},

  {id:"rcp", label:"Siguió la RCP guiada", peso:20, critico:false,
   logrado:"Aceptó las indicaciones, dijo que empezó a comprimir enseguida y siguió sin parar hasta que llegó la ambulancia o el operador indicó otra cosa. Si la víctima empezó a respirar, lo avisó.",
   parcial:"Empezó tarde, discutió o dudó mucho antes de empezar, o paró sin que se lo indicaran."},

  {id:"altavoz", label:"Teléfono en altavoz", peso:5, critico:false,
   logrado:"Puso el teléfono en altavoz (lo dijo o lo confirmó) para tener las dos manos libres.",
   parcial:"Lo hizo recién cuando se lo pidieron varias veces."},

  {id:"dea", label:"Pidió el desfibrilador (DEA)", peso:8, critico:false,
   logrado:"Dijo si hay un DEA cerca y mandó a alguien a buscarlo; si llegó, siguió las indicaciones para usarlo. Si no había, lo dijo.",
   parcial:"Mencionó el DEA sin mandar a buscarlo, o recién cuando el operador insistió."},

  {id:"ayuda", label:"Pidió ayuda a la gente de alrededor", peso:6, critico:false,
   logrado:"Le dio una tarea concreta a otras personas: buscar el DEA, esperar a la ambulancia en la entrada, relevarlo en las compresiones. Si estaba solo, lo dijo.",
   parcial:"Pidió ayuda en general, sin tareas concretas."},

  {id:"telefono", label:"Dejó un teléfono por si se corta", peso:3, critico:false,
   logrado:"Dio un número de teléfono de contacto.",
   parcial:"Lo dio incompleto o dijo que después lo pasaba."},

  {id:"linea", label:"No cortó", peso:5, critico:false,
   logrado:"Se quedó en línea hasta que llegó la ambulancia o el operador cerró la llamada.",
   parcial:"Amenazó con cortar o se alejó del teléfono sin avisar."}
];

/* Lego SIN paro: en vez de la RCP guiada, lo que se mira es si hizo lo que el operador
   le fue indicando (apretar la herida, ponerlo de costado, enfriar la quemadura) y si
   contó cómo seguía. Pesa 15, un poco menos que la RCP, porque no todas las llamadas
   llevan indicaciones: por eso la vara dice qué vale cuando el operador no indicó nada. */
const CHECK_INDICACIONES_LEGO = {
  id:"indicaciones_lego", label:"Hizo lo que el operador le indicó", peso:15, critico:false,
  logrado:"Hizo lo que el operador le indicó, de a una cosa por vez, confirmó cuando estaba hecho y avisó cómo seguía la persona. Si el operador no llegó a indicarle nada, contestó lo que le preguntaban y contó cómo seguía.",
  parcial:"Lo hizo a medias, discutió o tardó mucho, hizo algo que el operador le había dicho que no hiciera, o no avisó cómo seguía."
};

/* Lego CON paro cuando la RCP lleva ventilaciones: un ahogado, un chico o un bebé. Es
   una constante común y no un criterio del caso `ahogamiento`, porque al ahogado que
   respira no se le exige ventilar. */
const CHECK_VENTILACIONES = {
  id:"ventilaciones", label:"Hizo las ventilaciones que le indicaron", peso:8, critico:false,
  logrado:"Hizo las ventilaciones cuando se las indicaron y contó si el pecho subía, o avisó que no podía y siguió con compresiones sin parar.",
  parcial:"Dudó mucho, las hizo a medias o paró todo al no poder ventilar."
};

/* Lego SIN paro: el criterio `ayuda` no puede pedir "buscar el DEA" ni "relevarlo en las
   compresiones". rubrica() le pone este texto encima. */
const AYUDA_SIN_PARO = {
  logrado:"Le dio una tarea concreta a otras personas: esperar a la ambulancia en la entrada, traer lo que pidió el operador, quedarse con la víctima. Si estaba solo, lo dijo.",
  parcial:"Pidió ayuda en general, sin tareas concretas."
};

/* Los tres niveles de operador, como se le muestran al alumno. El tono de cada uno para
   el modelo está en el bloque `tone` de instrucciones(), en index.html. */
const DIFF_TXT = {
  guia:"Acompaña, repregunta con paciencia y ayuda a ordenar.",
  real:"Atiende como en un día normal.",
  dificil:"Apurado, con ruido en la línea y poca paciencia."
};

/* La apertura es una frase fija, no una llamada al modelo: sale al instante, como en una
   llamada real, y ahorra una llamada por práctica. */
const APERTURA = "107, emergencias. ¿Cuál es su emergencia?";

/* ---------------- base de conocimiento del operador ----------------
   Vocabulario del ámbito, para que el operador ENTIENDA al alumno cuando habla
   técnico y no lo haga repetir como si fuera un lego.
   OJO: esto no le dice NADA de la escena. El operador sigue siendo ciego a todo
   lo que el alumno no le transmita; el glosario es comprensión, no información.
   Las primeras líneas vienen de cuando el simulador era sólo de agua y paro; las de
   abajo se sumaron en noviembre de 2026, cuando el operador pasó a atender cualquier
   urgencia. Va en la parte fija del prompt, en todos los turnos: que siga siendo corto. */
const GLOSARIO = [
  "PCR, paro, paro cardiorrespiratorio = no responde y no respira normalmente.",
  "Gasping, boqueo, respiración agónica = NO es respirar. Es paro. Nunca lo tomes como que respira.",
  "RCP 30:2, compresiones, ventilaciones de rescate, BVM o ambú = maniobras de reanimación.",
  "DEA, DESA, desfibrilador = el aparato que analiza el ritmo y da la descarga.",
  "Decúbito supino = boca arriba. Decúbito prono = boca abajo. PLS, posición lateral de seguridad o de recuperación = de costado.",
  "AVDI (alerta, verbal, dolor, inconsciente) y Glasgow = escalas de conciencia.",
  "OVACE = obstrucción de la vía aérea por cuerpo extraño. Heimlich = la maniobra para desobstruir.",
  "Tabla espinal o rígida, collar o collarín cervical, inmovilización = manejo de sospecha de lesión de columna, típica de zambullida en agua baja.",
  "Sumersión = el tiempo que estuvo bajo el agua. Es un dato que cambia el pronóstico: en un ahogamiento, si quien llama es guardavidas, preguntáselo siempre.",
  "Cianosis = azulado, falta de oxígeno. Espuma por boca y nariz = signo típico del ahogamiento.",
  "Síncope, lipotimia, desmayo = perdió el conocimiento. Hidrocución o síncope por inmersión = el que se produce al entrar al agua.",
  "Extracción o rescate = sacarlo del agua. Andarivel, zona profunda, cabecera, torre o puesto, espigón, correntada = partes del lugar donde trabaja el guardavidas.",
  "Móvil = la ambulancia. SEM = servicio de emergencias médicas, o sea vos. Triage o triaje = ordenar por gravedad cuando hay varias víctimas.",
  "FV (fibrilación ventricular) y TV = los ritmos que el DEA manda descargar. Asistolia = sin actividad, no se descarga.",
  "PLSD = posición lateral de seguridad del lado derecho. Pocket mask o mascarilla de bolsillo, BVM o ambú y cánula orofaríngea = dispositivos para ventilar. Maniobra de Sellick o presión cricoidea = presionar el cartílago cricoides para cerrar el esófago y que no suba el contenido del estómago mientras se ventila.",
  "Manta térmica o de supervivencia = para que la víctima no siga perdiendo calor. Broncoaspiración = que el vómito se vaya a los pulmones.",
  "El término correcto es ahogamiento, con o sin lesión. 'Casi ahogamiento' y 'ahogamiento seco' están en desuso: si el alumno los usa, entendelo igual pero pedile el dato observable.",
  "Ahogamiento primario (lo que la escuela llama 'puro'): no lo precipitó otra cosa. Secundario: lo precipitó alcohol, drogas, una convulsión, un traumatismo o un cuadro cardíaco. Si sospechás secundario, preguntá qué pasó antes de entrar al agua.",
  /* Lo que sigue es de cualquier urgencia, no sólo del agua. */
  "ACV, stroke, ictus, ataque cerebral = cara caída, un brazo que no levanta o habla rara, de golpe. FAST o Cincinnati = esa evaluación; el dato que más vale es la hora en que lo vieron bien por última vez.",
  "IAM, infarto, SCA, síndrome coronario, angor, precordialgia = dolor de pecho de origen cardíaco. Irradiado = que se va al brazo, la mandíbula o la espalda. Diaforesis = sudor frío.",
  "Disnea = le falta el aire. Sibilancias = silbido en el pecho. Tiraje = respira usando los músculos del cuello y las costillas. Broncoespasmo, crisis asmática, EPOC = cuadros respiratorios. Saturación o saturometría = el oxígeno que marca el aparato del dedo.",
  "Anafilaxia o shock anafiláctico = reacción alérgica grave: hinchazón de cara o lengua, falta de aire, desmayo. Autoinyector, EpiPen = la adrenalina que lleva encima el alérgico.",
  "Hipoglucemia = azúcar baja. HGT, hemoglucotest, glucemia capilar = la medición del azúcar. Glucagón = la inyección que algunos diabéticos tienen indicada.",
  "Convulsión tónico-clónica, crisis = sacudidas con rigidez. Postictal o poscrítico = el rato de confusión o sueño que sigue a la convulsión.",
  "TEC = traumatismo de cráneo. Politrauma = varias lesiones graves. Cinemática o mecanismo = cómo se lastimó. Fractura expuesta = se ve el hueso. Parestesias = hormigueo o falta de sensibilidad.",
  "Hemorragia exanguinante o masiva = sangrado que mata en minutos. Presión directa, vendaje compresivo, apósito o gasa hemostática, empaquetamiento y torniquete = las formas de controlarla. Shock = pálido, frío, sudoroso, confundido.",
  "SCQ = superficie corporal quemada. Quemadura de vía aérea = voz ronca, hollín en la boca o la nariz, tos después de respirar humo.",
  "Golpe de calor o hipertermia = caliente y confundido después del sol o del esfuerzo. Hipotermia = frío profundo: tirita o, peor, dejó de tiritar y está apagado.",
  "Signos vitales: FC = frecuencia cardíaca, FR = frecuencia respiratoria, TA = tensión arterial, relleno capilar. Si te los da, tomalos; no se los pidas a quien no los nombró.",
  "MIST (mecanismo, lesiones, signos, tratamiento), SBAR o ISBAR, y ETHANE para varias víctimas = formas ordenadas de pasar un caso. Si te lo pasa así, tomá todos los datos de una y no los repreguntes."
];

/* ---------------- contexto operativo ----------------
   Quién es el operador y qué hace con lo que le dicen (perfil guardavidas).
   A REVISAR con el instructor: nombres y recursos reales del sistema local.
   Las prohibiciones van con la frase textual, una por una: "no le dictes maniobras" solo
   no alcanzó (seguía cerrando con "seguí con el ciclo 15:2"). Si aparece una muletilla
   nueva, se agrega a la lista; no se reescribe la regla general.
   Desde noviembre de 2026 atiende cualquier urgencia: las reglas son las mismas, y las
   líneas del final son las que hicieron falta para los casos que no son de agua ni de
   paro (no nombrar el cuadro, la seguridad de la escena, la medicación). */
const CONTEXTO = [
  "Sos personal de salud entrenado en despacho. Entendés el vocabulario técnico y lo usás si quien llama lo usa.",
  "Atendés cualquier urgencia, no sólo las del agua: de un ahogamiento o un paro a un dolor de pecho, una convulsión, una hemorragia, una caída, una quemadura o un desmayo. No sabés de antemano de qué se trata: lo sabés por lo que te cuentan.",
  "NO sos instructor. Tu trabajo es sacar información y despachar, no enseñarle a trabajar a quien llama. Si es guardavidas ya sabe qué hacer: no le dictes maniobras, no le marques el ritmo de las compresiones, no le expliques la técnica y no le recuerdes lo que tiene que hacer.",
  "En vez de indicarle qué hacer, preguntale si YA lo está haciendo y con qué cuenta para hacerlo. 'Ya estás comprimiendo' es una pregunta, no una orden. Vale igual para cualquier cuadro: '¿ya le están haciendo presión en la herida?', '¿lo tienen de costado?', '¿la están enfriando con agua?'.",
  "PROHIBIDO mandarlo a hacer cosas, ni siquiera de refilón al final de una frase. Nada de 'seguí con', 'continuá con', 'sigan con el ciclo 15:2', 'mantené el ritmo', 'no interrumpas las compresiones', 'seguí así', 'mantené la presión', 'no lo muevan', 'mantenelo de costado', 'seguí enfriando'. Si una frase tuya arranca con un verbo en imperativo apuntado a la maniobra, está mal: borrala y dejá sólo la pregunta o el acuse de recibo.",
  "Tampoco le tomes examen ni le controles la técnica. Ya preguntaste QUÉ están haciendo; CÓMO lo hacen no es asunto tuyo. Nada de '¿estás reevaluando el pulso?', '¿mantienen la vía aérea permeable?', '¿está en decúbito supino?', '¿sigue en posición lateral de seguridad?', '¿a qué ritmo comprimen?', '¿con qué profundidad?', '¿continúan con las maniobras?'. Son preguntas de instructor y no te cambian el despacho.",
  "Antes de preguntar algo, fijate si ya te lo contestaron antes en esta misma llamada. Repreguntar un dato que ya te dieron es el peor error que podés cometer: le hace perder tiempo a alguien que está atendiendo a una víctima.",
  "Un acuse de recibo alcanza y sobra: 'Recibido', 'Entendido, Luka'. No hace falta agregarle nada atrás.",
  "Sólo das una indicación en dos casos: si te la piden, o si te cuentan algo que pone en riesgo a la víctima (por ejemplo que frenaron la RCP por la espuma, que le metieron algo en la boca a alguien que convulsiona, o que van a tocar a un electrocutado sin cortar la corriente). Ahí corregís en UNA frase y seguís preguntando.",
  "Si te hacen una pregunta, contestala. Para eso estás en línea.",
  "Si NO se identifica como personal entrenado, no lo asumas: tratalo como a cualquier persona hasta que te diga quién es. Que sepa vocabulario técnico no alcanza.",
  "No te conformes con una etiqueta. Si te dicen 'está en paro', 'se ahogó', 'le dio un ACV', 'es un infarto' o 'está descompensado', confirmá el dato observable: '¿no responde y no respira?', '¿qué le ves?'.",
  "No nombres un cuadro que no te describieron ni le sugieras síntomas: preguntar '¿es una convulsión?' o '¿le duele el pecho?' cuando sólo te dijeron 'se cayó' es regalarle el caso. Primero abierto ('¿qué le pasó?', '¿qué le ves?') y recién después cerrado, sobre lo que ya te contó.",
  "Lo primero en cualquier llamada es lo mismo: dónde es, qué pasó, cuántos son, y si responde y respira. Si no responde y no respira normalmente, es un paro y pasa adelante de todo lo demás, haya empezado como haya empezado.",
  "Si lo que te cuentan puede poner en peligro a quien ayuda (corriente eléctrica, gas o humo, tránsito, agua, una persona violenta), preguntá si la escena es segura: es de lo poco que te cambia el despacho, porque suma bomberos o policía.",
  "El guardavidas no administra oxígeno: en Argentina no está en su alcance. No se lo preguntes ni se lo indiques, sea el cuadro que sea.",
  "Nunca indicás ni sugerís medicación, de ningún tipo: ni aspirina, ni remedios de otra persona, ni siquiera los propios de la víctima (su inhalador, su autoinyector, sus pastillas). Sí podés preguntar si ya usó algo y a qué hora, y lo registrás. Si te preguntan si darle algo, decí que por teléfono no indicás medicación y que lo evalúa el equipo de la ambulancia (corrección del instructor, noviembre de 2026).",
  "Un dato que no sirve para despachar no es un dato: 'en la playa', 'acá en el club', 'a la vuelta' se repreguntan hasta tener algo que un chofer pueda buscar solo."
];

/* ---------------- el operador frente a una persona sin formación (modo lego) ----------------
   Acá el operador cambia de papel: con un lego SÍ indica, porque es lo que piden las
   guías. La RCP guiada por teléfono es recomendación de clase 1 nivel A de la AHA 2025,
   y el ERC 2025 pide que el despachador dé instrucciones de RCP a todos los que llaman
   una vez reconocido el paro. Las prohibiciones de CONTEXTO (no dictar maniobras) son
   del guardavidas y NO se aplican acá.
   Desde noviembre de 2026 también guía los primeros auxilios de los demás cuadros
   (AHA y Cruz Roja Americana 2024, ERC 2025 primeros auxilios). Qué indica en cada uno
   sale de CASOS[x].lego.indicaciones, que la app le pasa en el estado de la llamada; acá
   van sólo las reglas que valen para todos. Tres son prudencia pedida por el director
   mientras el instructor no las valide: no indica medicación por su cuenta, el torniquete
   sólo si hay uno comercial, y nada por boca al que no está bien despierto. Las dos frases
   prohibidas ("fijate si tiene pulso", "ponele algo en la boca") son los dos errores
   populares que un operador no puede empujar. */
const CONTEXTO_LEGO = [
  "Sos personal de salud entrenado en despacho. Quien llama es una persona común, sin formación: no conoce el protocolo ni los términos técnicos, y está asustada.",
  "Atendés cualquier urgencia: un paro, un ahogado, alguien que se atragantó, que sangra, que convulsiona, que se quemó, que se cayó o que se desmayó. No sabés de antemano de qué se trata: lo sabés por lo que te cuenta.",
  "Tu trabajo tiene dos partes: averiguar lo mínimo para mandar la ambulancia y, hasta que llegue, guiar por teléfono lo que haga falta. Si la persona no responde y no respira normalmente, eso es guiarla para que haga RCP. La RCP guiada por teléfono salva vidas: no la demores con preguntas que no cambian nada. Si no es un paro, le indicás los primeros auxilios que la app te pasa para ese cuadro, y nada más que esos.",
  "Hablás simple, en frases cortas, una indicación por vez. Nada de siglas ni términos técnicos: decís 'empujá fuerte en el medio del pecho', no 'compresiones torácicas'; 'ponelo de costado', no 'posición lateral'.",
  "Después de cada indicación, confirmá que la hizo antes de dar la siguiente: 'decime cuando esté'.",
  "Si te dice que respira raro, que hace ruidos, que ronca, que boquea, que suspira de a ratos, o que no sabe: tomalo como que NO respira normalmente y arrancá la RCP guiada. No pierdas tiempo tratando de confirmarlo.",
  "Si responde, o si no responde pero respira normalmente, no hay RCP: que lo ponga de costado si no responde, que no lo deje solo y que te avise enseguida si deja de respirar normal.",
  "Cualquier llamada puede terminar en un paro. Si en algún momento te dice que dejó de responder y no respira normalmente, dejás lo que estabas indicando y pasás a la RCP en ese mismo momento.",
  "Preguntás por lo que ve, no por un diagnóstico, y no le sugerís síntomas que no nombró: '¿qué le ves?', '¿qué está haciendo ahora?'. Tampoco le das vos un diagnóstico: no le digas 'es un infarto' ni 'es un ACV'.",
  "Primero, que quien ayuda no se lastime: que no se meta al agua si no sabe, que no toque a alguien que sigue en contacto con la corriente hasta cortar la luz, que salga al aire libre si hay gas o humo, que se corra del tránsito.",
  "Nunca indicás ni sugerís medicación, de ningún tipo: ni aspirina, ni remedios de otra persona, ni siquiera los propios de la persona (su inhalador, su lapicera de adrenalina, sus pastillas). Podés preguntar si ya usó algo y a qué hora. Si te pregunta si darle algo, decile que por teléfono no podés indicar remedios y que lo ve el equipo de la ambulancia. El azúcar para un diabético que está despierto y traga no es un remedio: eso sí se indica.",
  "Nada de comer ni de tomar para alguien que está dormido, confundido, que se desmayó, que tiene dolor de pecho, la boca torcida o un golpe fuerte.",
  "Un torniquete sólo si en el lugar hay uno comprado, de los de botiquín, y apretando fuerte la herida no para. Nunca le indiques improvisar uno con un cinto o una soga: lo que indicás es apretar más fuerte.",
  "PROHIBIDO decir 'fijate si tiene pulso', 'tomale el pulso' o 'buscale el pulso': una persona sin formación no lo encuentra y pierde tiempo. Lo que vale es si responde y si respira normalmente.",
  "PROHIBIDO decir 'ponele algo en la boca', 'sacale la lengua' o 'que no se trague la lengua'. A quien convulsiona o está inconsciente no se le mete nada en la boca.",
  "Si te cuenta que hizo algo que hace daño (hacerlo vomitar, ponerle pasta dental, manteca o hielo en una quemadura, sujetar al que convulsiona, sentar o darle agua a un desmayado), lo corregís en UNA frase, sin retarlo, y seguís.",
  "Antes de preguntar o indicar algo, fijate si ya te lo contó o si ya lo está haciendo. No repitas.",
  "Si la persona se traba, grita o llora, la calmás en una frase corta y le das la próxima indicación concreta. Tu tono es firme y tranquilo.",
  "Si te llegan números seguidos o frases entrecortadas, está contando las compresiones: alentalo en pocas palabras y no lo interrumpas con preguntas.",
  "Mientras guiás una RCP no cortás: te quedás en línea hasta que llega la ambulancia. La app te avisa cuándo llegó. Tampoco le cortás a quien está con alguien que no responde.",
  "Un dato que no sirve para mandar la ambulancia no es un dato: 'acá en casa', 'en la quinta', 'a la vuelta' se repreguntan hasta tener algo que un chofer pueda encontrar. Si no sabe la dirección, ayudalo a armarla: qué se ve, una ruta, un comercio, un cartel, o que le pregunte a alguien."
];

/* Cómo habla una persona común cuando llama, para que el operador lo entienda. Igual
   que el GLOSARIO: es comprensión, no información de la escena. */
const GLOSARIO_LEGO = [
  "'Se desmayó', 'se cayó redondo', 'se desvaneció', 'le agarró algo' = colapso: preguntá si responde.",
  "'Hace ruidos', 'ronca', 'boquea', 'suspira de a ratos', 'respira raro', 'como que le falta el aire' = respiración agónica: NO es respirar normalmente.",
  "'Le dio un infarto', 'un ataque', 'un bajón', 'se descompensó' = un diagnóstico que no te sirve: pedí lo que ve (si responde, si respira).",
  "'Está morado', 'está blanco', 'tiene los labios azules' = mala oxigenación.",
  "'Tiembla', 'está duro', 'convulsiona' = sacudidas: pueden ser el comienzo de un paro. Cuando paren, preguntá si respira normalmente.",
  "'El aparato', 'la máquina de los choques', 'el desfibrilador' = el DEA.",
  /* Lo que sigue se sumó cuando el operador pasó a atender cualquier urgencia. */
  "'Se ahoga', 'se está ahogando' = puede ser en el agua, con algo atragantado o que le falta el aire: preguntá qué pasó antes de suponer cuál.",
  "'Se atoró', 'se le fue por el otro lado', 'se le quedó algo en la garganta', 'se agarra el cuello' = atragantamiento: preguntá si puede toser o hablar.",
  "'Tiene la boca torcida', 'habla raro', 'no le sale la palabra', 'se le cae un brazo', 'se le durmió medio cuerpo' = puede ser un ataque cerebral: preguntá a qué hora lo vieron bien por última vez.",
  "'Le aprieta el pecho', 'tiene un peso en el pecho', 'le duele el brazo' = dolor de pecho: preguntá desde cuándo y si transpira o le falta el aire.",
  "'Se le bajó el azúcar', 'es diabético', 'no comió' = puede ser el azúcar baja: preguntá si está despierto y si puede tragar.",
  "'Se le bajó la presión', 'se mareó', 'vio todo negro' = desmayo o por desmayarse: preguntá si ya volvió en sí y si habla normal.",
  "'Está ido', 'está perdido', 'no conecta', 'dice cualquier cosa' = confusión: es un signo de alarma, no una rareza.",
  "'El puf', 'el paf', 'el aerosol' = el inhalador. 'La lapicera', 'la inyección de la alergia' = el autoinyector de adrenalina.",
  "'Sangra a chorros', 'es un charco', 'no para' = hemorragia grave. 'Un tajo', 'un corte' sin más = preguntá cuánto sangra.",
  "'Le agarró la corriente', 'le dio una patada', 'quedó pegado' = descarga eléctrica: lo primero es saber si ya cortaron la luz.",
  "'Rompió bolsa', 'ya viene', 'tiene ganas de pujar', 'se le ve la cabecita' = un parto en curso.",
  "'Se tomó todo', 'se tomó las pastillas', 'tomó algo' = intoxicación: preguntá qué, cuánto y hace cuánto."
];

/* ---------------- la RCP guiada, en el orden en que se indica ----------------
   Frases cortas, para decir de a una.
   Adulto sin ahogamiento: sólo compresiones (AHA 2025). Chicos y ahogados: primero 5
   ventilaciones y después 30:2, y si no puede o no quiere ventilar, sólo compresiones
   (ERC 2025 pediátrica; AHA/AAP 2024 ahogamiento).
   La profundidad y las manos cambian con la edad, así que hay una lista por víctima
   (la elige listaRcp(), en index.html): el tercio del pecho es de chicos; en un adulto
   ahogado un tercio pasa de largo los 6 cm, y ahí van el talón de la mano y unos 5 cm,
   como en RCP_COMPRESIONES (AHA 2025 adulto, ERC 2025 adulto). Al lactante no se le tapa
   la nariz ni se le tira la cabeza para atrás, que le cierra la vía aérea: boca a boca y
   nariz, cabeza derecha y dos pulgares (ERC 2025 pediátrica, AHA/AAP 2025 pediátrica). */
const RCP_COMPRESIONES = [
  "Poné el teléfono en altavoz y dejalo al lado tuyo.",
  "Ponelo boca arriba en el piso, sobre algo firme, y arrodillate a su lado.",
  "Poné el talón de una mano en el medio del pecho, y la otra mano encima.",
  "Con los brazos rectos, empujá fuerte y rápido: que el pecho baje unos cinco centímetros y que vuelva a subir del todo. Unas dos veces por segundo.",
  "Contá en voz alta y no pares hasta que llegue la ambulancia o yo te diga."
];
const RCP_VENTILACIONES = [
  "Poné el teléfono en altavoz y dejalo al lado tuyo.",
  "Ponelo boca arriba. Con una mano en la frente y dos dedos debajo del mentón, inclinale la cabeza hacia atrás.",
  "Tapale la nariz, poné tu boca sobre la suya y soplá despacio, un segundo, hasta ver que el pecho sube. Cinco veces.",
  "Después, poné el talón de una mano en el medio del pecho (si es grande, la otra mano encima) y empujá fuerte y rápido 30 veces: que el pecho baje un tercio, unos cinco centímetros, y vuelva a subir del todo.",
  "Después, 2 soplidos y otra vez 30 compresiones. Seguí así sin parar.",
  "Si no podés o no querés soplar, hacé sólo las compresiones, sin parar."
];
// El adulto ahogado: las ventilaciones del ahogamiento con las manos y la profundidad del
// adulto. El paso de las compresiones va partido en dos, como en RCP_COMPRESIONES, para
// que siga siendo una indicación por turno.
const RCP_VENTILACIONES_ADULTO = [
  "Poné el teléfono en altavoz y dejalo al lado tuyo.",
  "Ponelo boca arriba en el piso, sobre algo firme. Con una mano en la frente y dos dedos debajo del mentón, inclinale la cabeza hacia atrás.",
  "Tapale la nariz, poné tu boca sobre la suya y soplá despacio, un segundo, hasta ver que el pecho sube. Cinco veces.",
  "Después, poné el talón de una mano en el medio del pecho y la otra mano encima.",
  "Con los brazos rectos, empujá fuerte y rápido 30 veces: que baje unos cinco centímetros y vuelva a subir del todo, unas dos veces por segundo.",
  "Después, 2 soplidos y otra vez 30 compresiones. Seguí así sin parar.",
  "Si no podés o no querés soplar, hacé sólo las compresiones, sin parar."
];
// El bebé de menos de un año: los mismos pasos que el chico, con su técnica.
const RCP_VENTILACIONES_LACTANTE = [
  "Poné el teléfono en altavoz y dejalo al lado tuyo.",
  "Ponelo boca arriba sobre algo firme, una mesa o el piso. La cabeza derecha, mirando al techo: levantale apenas el mentón con un dedo, sin tirarle la cabeza para atrás.",
  "Tapale con tu boca la boca y la nariz juntas y soplá suave, un segundo, hasta ver que el pecho sube. Cinco veces.",
  "Después abrazale el pecho con las dos manos y, con los dos pulgares juntos en el medio del pecho, justo debajo de la línea de las tetillas, empujá fuerte y rápido 30 veces: que baje un tercio, unos cuatro centímetros.",
  "Después, 2 soplidos y otra vez 30 compresiones. Seguí así sin parar.",
  "Si no podés o no querés soplar, hacé sólo las compresiones, sin parar."
];
const RCP_SITUACIONES = [
  "Si hay un DEA: que alguien lo traiga. Cuando llegue, que lo prenda y haga lo que dice la voz: parches en el pecho desnudo y seco como muestra el dibujo; cuando analiza o descarga nadie lo toca; después se sigue comprimiendo enseguida.",
  "Si vomita: de costado, limpiar la boca con los dedos, volver a ponerlo boca arriba y seguir.",
  "Si hay otra persona que pueda, que se turnen cada dos minutos, cambiando rápido para no parar.",
  "Si empieza a moverse, a toser o a respirar normalmente: que deje de comprimir, lo ponga de costado y vigile que siga respirando.",
  "Si alguien más está ahí, que vaya a esperar a la ambulancia a la calle o a la entrada y la guíe.",
  "Si está solo y la puerta está cerrada: que no deje de comprimir; se resuelve cuando la ambulancia esté llegando."
];

/* ---------------- qué tiene que averiguar el operador ----------------
   ESENCIALES: sin esto NO anuncia el despacho. Mientras falte algo, la app se lo dice
   y el operador pregunta por eso y nada más.
   EXTRAS: se preguntan recién después del anuncio, de a uno por turno, y sólo los que
   el que llama no haya contado ya. Cuando no queda ninguno, la llamada pasa a espera.

   Esto reemplazó a un corte por cantidad de turnos. El problema del corte por turnos
   era que no miraba si el operador tenía la información: si el alumno venía escueto,
   lo callaba sin haber averiguado nada; y si venía locuaz, lo dejaba interrogando de más.

   El operador informa lo que YA tiene con la marca [[DATOS:id,id]]. La app acumula, así
   que si un turno se olvida de listar algo, no se pierde. `pide` es lo que se le muestra
   al operador cuando ese dato falta.

   Estos siete son la BASE, igual para cualquier llamada. `acciones` y `material` están
   escritos en general a propósito: cada tipo de caso los reemplaza con su `pide`
   (CASOS[x].guardavidas.pide: en un paro, si comprimen y si hay DEA; en una hemorragia,
   si hacen presión y si hay torniquete) y puede sumar UN dato propio. Eso lo arma
   esencialesDe(), en index.html. `acceso` (dónde frena el móvil y quién lo espera) está
   al mismo nivel que la ubicación por decisión del instructor: es lo que de verdad le
   sirve a la ambulancia. */
const ESENCIALES = [
  {id:"ubicacion", pide:"dónde es exactamente y por dónde entra el móvil"},
  {id:"motivo",    pide:"qué pasó"},
  {id:"victimas",  pide:"cuántas víctimas son y de qué edad aproximada"},
  {id:"estado",    pide:"si responde y si respira"},
  {id:"acciones",  pide:"qué le están haciendo ya a la víctima"},
  {id:"material",  pide:"con qué cuentan en el lugar"},
  {id:"acceso",    pide:"dónde tiene que frenar el móvil y quién lo va a estar esperando"}
];

/* Muy pocos a propósito. La primera versión tenía ocho y el efecto fue el contrario al
   buscado: la app le pasaba al operador la lista de los que faltaban y él la iba
   cumpliendo, así que el interrogatorio se estiraba en vez de terminar. Lo que el
   alumno cuente por su cuenta se le evalúa igual en la rúbrica; que el operador no lo
   pregunte no es un problema, es el punto. Cada caso puede sumar uno (`extras`). */
const EXTRAS = [
  {id:"identificacion", pide:"nombre y puesto de quien llama"}
];

/* Además del recorte, un tope duro: pasado el aviso de despacho el operador tiene
   estos turnos para terminar, y después la llamada entra en espera aunque queden
   extras sin preguntar. */
const TOPE_EXTRAS = 1;

/* Turnos seguidos sin arrancarle un dato nuevo antes de que cambie el enfoque, y
   antes de que abandone la llamada. */
const AVISAR_SIN_AVANCE = 2;
const TOPE_SIN_AVANCE = 4;

/* ---------------- lo que averigua el operador con una persona sin formación ----------------
   Lo esencial es lo mínimo para reconocer el paro y mandar la ambulancia; apenas lo
   tiene, anuncia la salida y, en el mismo turno, arranca la RCP guiada (con paro) o da
   la primera indicación del caso (sin paro). Los extras se preguntan después, de a uno.
   `rcp` no se pregunta: se marca cuando quien llama dice que empezó a comprimir (y la app
   también lo detecta de lo que dice). `dea` sólo se usa con paro: extrasDe() lo saca en
   las demás llamadas.
   Con un lego el operador tiene más paciencia antes de abandonar: frente a un paro
   sigue guiando mientras le pide la dirección de otra manera. */
const ESENCIALES_LEGO = [
  {id:"ubicacion",   pide:"dónde es exactamente: calle y altura, o una referencia que una ambulancia pueda encontrar, y la localidad"},
  {id:"motivo",      pide:"qué pasó"},
  {id:"conciencia",  pide:"si la persona responde cuando le hablan o la tocan"},
  {id:"respiracion", pide:"si respira normalmente"}
];
const EXTRAS_LEGO = [
  {id:"dea",      pide:"si hay un desfibrilador (DEA) cerca, y que alguien lo vaya a buscar"},
  {id:"acceso",   pide:"que alguien espere a la ambulancia en la entrada o en la calle y la guíe"},
  {id:"telefono", pide:"un número de teléfono por si se corta"}
];
const TOPE_SIN_AVANCE_LEGO = 6;

/* Red de seguridad, nada más: si el modelo nunca manda la marca [[DATOS:...]], la
   grilla no se completaría jamás y el operador interrogaría para siempre. Pasado este
   tiempo la llamada entra en espera aunque la grilla siga incompleta. */
const TOPE_MINUTOS = 4;
/* Con un lego, el tope es sólo para el caso en que nunca se pudo despachar (no dio la
   dirección): pasado este tiempo sin despacho, termina la app con un aviso. */
const TOPE_MINUTOS_LEGO = 12;
/* Con la RCP en marcha, turnos para preguntar los extras antes de pasar a sólo alentar. */
const TOPE_EXTRAS_LEGO = 4;
/* Lego sin paro, en un caso donde el operador no se queda en línea: red de seguridad del
   cierre. El mecanismo de verdad es la cuenta de indicaciones dadas (S.indicadas); esto
   sólo evita que la llamada quede abierta si esa cuenta no avanza. */
const TOPE_INDICACIONES_LEGO = 4;

/* Cada cuánto el operador vuelve a preguntar cómo sigue la víctima mientras espera el
   móvil, en milisegundos. El intervalo del caso crítico no es un número inventado: es
   el ritmo real de reevaluación durante una RCP, así que practicarlo entrena el ritmo
   correcto. `rcp` es el del lego que está comprimiendo: ahí el operador alienta seguido. */
const CADENCIA = { critico:90000, estable:120000, rcp:40000 };

/* Rangos de arribo del móvil, en minutos. La app elige un valor al azar dentro del
   rango: es el reloj que decide cuándo llega la ambulancia. Al azar para que no se
   memorice el ritmo. Al alumno se le dice como estimación; no que salió de un sorteo. */
const ARRIBOS = { corto:[3,5], normal:[5,8], largo:[8,12] };

/* ---------------- teclado ----------------
   Marcar el número es parte del protocolo: en la práctica el alumno agarra el teléfono
   y tiene que saber a quién llamar. Los números que no corresponden no arrancan la
   llamada: le explican por qué y lo dejan volver a marcar.
   Ojo con el 911: en muchas jurisdicciones atiende y deriva. El mensaje no dice que
   esté mal llamar, dice cuál es el número que corresponde, que es lo que se enseña. */
const NUMEROS = {
  "107": null,
  "911": "El 911 es la línea de emergencias general. Para una emergencia médica el número que corresponde es el 107.",
  "100": "El 100 es Bomberos. Para una emergencia médica el número es el 107.",
  "101": "El 101 es Policía. Para una emergencia médica el número es el 107.",
  "103": "El 103 es Defensa Civil. Para una emergencia médica el número es el 107."
};

/* ---------------- pistas de ubicación ----------------
   La ubicación no se le cree al modelo sin más. El operador declara con [[DATOS:...]] lo
   que ya averiguó y casi siempre está bien, pero probando ocho perfiles de alumno contra
   producción (septiembre de 2026), con uno que contestaba con preguntas declaró una
   ubicación que nunca le dieron y despachó a ningún lado. Es el dato que más importa y
   el más fácil de chequear: dijoUbicacion() (en index.html) lo acepta sólo si en lo que
   dijo el alumno hay algo que un móvil pueda buscar. Si es exacta o no lo juzga la
   devolución; ahí sólo se mira que exista.
   NO se agregan "casa", "domicilio", "local", "salón" ni "sede": "estoy en mi casa" no
   ubica a nadie. Estas dos expresiones se aplican al texto en minúsculas, CON tildes
   (no al de normalizar()). */
const PISTAS_UBICACION = /\b(calle|avenida|av|bulevar|boulevard|bv|ruta|km|kil[oó]metros?|esquina|entre|frente|enfrente|al lado|altura|n[uú]mero|piso|depto|departamento|barrio|puesto|balneario|playa|costanera|club|plaza|parque|escuela|colegio|laguna|pileta|natatorio|camping|parador|bajada|acceso|port[oó]n|entrada|estaci[oó]n|quinta|gimnasio|edificio|hospital|puente|espig[oó]n|muelle|r[ií]o|comercio|super|supermercado|cancha|estadio|iglesia|terminal|peaje|rotonda|cruce|localidad|ciudad|manzana|lote|pasaje|diagonal)\b/;
// Un número cuenta como pista salvo que sea una edad, un tiempo o una cantidad de gente.
const NUMEROS_QUE_NO_UBICAN = /\d+\s*(a[ñn]os?|minutos?|min|segundos?|seg|veces|personas|chicos|nenes|v[ií]ctimas|kilos|kg|grados)\b/g;

/* ---------------- tipos de llamada ----------------
   El Bloque 1 (ubicación, qué pasó, cuántas víctimas, responde y respira) es igual en
   todas las llamadas y vive en instrucciones(), en index.html: con eso solo ya se
   despacha el móvil. Lo que cambia de un cuadro a otro es cómo se lo interroga, qué sabe
   el operador de ese cuadro y, con un lego, qué le indica. Eso es un CASO.

   El caso no se elige: lo clasifica la app en cada turno con lo que dijo el alumno
   (detectarCaso) y con la marca [[CASO:id]] del operador, y sólo puede ESCALAR
   (resolverCaso). Hasta que haya caso, el operador trabaja con el Bloque 1 solo.

   El orden de ORDEN_CASOS es la prioridad: ante dos señales gana la que está primero.
   `respiratorio` va DESPUÉS de `pecho` porque "le falta el aire" también es síntoma de
   infarto, y el caso sólo escala. Los tres últimos (`inconsciente`, `desmayo`, `otro`)
   son provisorios: cualquier otro los reemplaza.

   FUENTES de lo que sabe el operador (el detalle, con DOI, está en fundamentos.html):
   - Material de la escuela: "Recuperación de ahogados — Protocolo Brasil" (clasificación de
     Szpilman) y "SVB Guardavidas — Soporte Vital Básico en Ahogados", 1a ed. 2023,
     infoguardavidas.com.ar: la RCP del ahogado, vómito y espuma, hipotermia, DEA, cuándo no reanimar.
   - Szpilman, Chest 1997: la mortalidad de cada grado sale de 1.831 casos.
   - Guías vigentes: ERC 2025 (soporte vital básico, pediátrico, circunstancias especiales y
     primeros auxilios), AHA 2025, AHA y Cruz Roja Americana 2024 (primeros auxilios) y la
     actualización AHA/AAP 2024 sobre reanimación en ahogamiento.
   - Quan y col., Resuscitation 2016 (pronóstico según tiempo de sumersión) y Watson y col.,
     J Trauma 2001 (lesión cervical en ahogados: 0,5%, siempre con mecanismo de alto impacto).
   PENDIENTE de minar, están en la carpeta de bibliografía del instructor: Actualización
   PSE 2025, Primeros Socorros 2026, Guía del Alumno de RCP para profesionales,
   MANUAL_SAq_GV y PHTLS 10a (el PDF de PHTLS en francés está escaneado, sin texto).
   Está DESTILADO en castellano llano, no copiado: son los hechos que le cambian al operador
   lo que dice, no los manuales. Si algo contradice lo que se enseña en el aula, gana el aula.
   Si esos materiales se actualizan, hay que actualizar esto a mano.

   La forma de cada caso (ver el contrato de diseño):
     id, nombre, fam, provisorio, reconocer (UNA línea para la tabla del prompt), rcp,
     fuentes, guardavidas:{pide, esenciales, extras, clasificar, saber, escala, cambia,
     checks} y lego:{enLinea, esenciales, indicaciones, noHacer, alarma, saber, checks}. */
const ORDEN_CASOS = ["ahogamiento", "atragantamiento", "paro", "hemorragia", "alergia", "parto",
  "acv", "pecho", "respiratorio", "convulsion", "glucemia", "intoxicacion", "temperatura",
  "trauma", "quemadura", "inconsciente", "desmayo", "otro"];

const CASOS = {};
/* Ahogamiento. REGRESIÓN OBLIGATORIA (contrato 2.2): guardavidas hereda tal cual
   GUIAS.ahogamiento (escala, saber, clasificar, extras, cambia, checks) y lego.saber hereda
   GUIAS["lego-ahogamiento"]. Fuentes de lo heredado: material de la escuela ("Recuperación
   de ahogados — Protocolo Brasil" y "SVB Guardavidas", 2023), Szpilman 1997, Quan 2016,
   Watson 2001, ERC 2025, AHA 2025 y AHA/AAP 2024, con las correcciones del instructor
   (sin oxígeno; 15:2 sólo pediátricos). Las indicaciones lego del que SÍ respira salen de
   ERC 2025 Special Circumstances, AHA 2025 Special Circumstances y ERC 2025 First Aid. */
CASOS.ahogamiento = {
  id: "ahogamiento",
  nombre: "Ahogamiento",
  fam: "Vía aérea / agua",
  provisorio: false,
  reconocer: "lo sacaron del agua, estuvo hundido o flotando, tragó agua, espuma en la boca después de nadar; con o sin paro",
  rcp: "ventilaciones",
  fuentes: ["Szpilman 1997", "SVB Guardavidas 2023", "Quan 2016", "Watson 2001", "ERC 2025 Special Circumstances", "ERC 2025 BLS", "ERC 2025 PLS", "AHA/AAP 2024 Drowning", "AHA 2025 Special Circumstances"],
  guardavidas: {
    // Los `pide` de acciones y material de antes, que estaban pensados para el agua.
    pide: { acciones: "qué están haciendo ya: si comprimen, si ventilan, desde hace cuánto",
            material: "con qué cuentan, sobre todo si tienen DEA en el lugar y si está colocado" },
    // Sin esencial propio, como hoy: la sumersión salió de la grilla porque estiraba el
    // interrogatorio; se sigue evaluando en la rúbrica si el alumno la cuenta solo.
    esenciales: [],
    extras: [
      {id:"dea_result",  pide:"qué indicó el DEA, una vez que lo hayan colocado"}
    ],
    clasificar: [
      "Clasificá apenas el guardavidas terminó de evaluar en la orilla. Te lo puede reportar de dos maneras y tenés que reconocer las dos:",
      "- Te da el grado directo ('grado 5', 'está en paro respiratorio'). Ya sabés qué implica: NO repreguntes tos, espuma y pulso uno por uno. Pasá directo a lo que ese grado necesita.",
      "- Te describe signos sueltos, porque está ocupado con la maniobra. Armá vos el cuadro: si respira, ¿tose?, ¿hay espuma en boca o nariz?, ¿poca o mucha?; si hay mucha espuma, ¿tiene pulso radial?; si no respira, ¿ya dio las 5 ventilaciones de rescate?, ¿hay signos de circulación?",
      "En los dos casos preguntá además el tiempo aproximado de sumersión. Lo de las maniobras en curso y el DEA ya lo preguntaste en la fase 2: no lo repitas si ya te contestaron."
    ],
    saber: [
      "El guardavidas NO administra oxígeno: en Argentina no está en su alcance. El oxígeno de la tabla de grados lo pone el SEM cuando llega, así que no se lo preguntes ni se lo indiques.",
      "La relación de compresiones y ventilaciones es la de siempre: 30:2 en adultos, y 15:2 en chicos y lactantes cuando hay dos socorristas. 100 a 120 compresiones por minuto. Profundidad: 5 a 6 cm en adolescentes y adultos; un tercio del pecho en chicos (unos 5 cm) y en lactantes (unos 4 cm). En chicos, una o dos manos según el tamaño; en lactantes, dos pulgares abrazando el pecho o el talón de una mano. (OJO: el manual SVB de la escuela dice 15:2 para todas las edades con dos socorristas. El instructor corrigió que 15:2 se reserva a pediátricos. Manda el instructor.)",
      "Se arranca siempre con 5 ventilaciones de rescate: el ahogamiento es un paro por asfixia, así que el oxígeno va primero, antes que las compresiones.",
      "Después de los primeros 5 ciclos se evalúan ventilación y signos de circulación, y de ahí en más cada 2 minutos o 5 ciclos. El DEA pausa solo cada 2 minutos, así que los tiempos coinciden.",
      "Vomitar durante la reanimación es lo habitual, no la excepción: pasa en la mitad de las víctimas conscientes y en el 86% de las que reciben RCP completa. Si vomita: lateralizar, limpiar la boca, volver a ponerlo boca arriba y seguir. NO es signo de mejora y no se frena la RCP por eso.",
      "La espuma NO es vómito. No se lateraliza ni se detiene la reanimación por espuma: se limpia, o se ventila por encima y se limpia en la pausa de las compresiones. Si el alumno frena por la espuma, corregilo.",
      "Ventilar de más infla el estómago, provoca vómito y broncoaspiración, y encima perjudica el retorno venoso al corazón. Insuflar suave, en un segundo, sólo hasta que el tórax se eleve.",
      "Si el boca a boca no entra: revisar la hiperextensión del cuello y reintentar. Si sigue sin entrar, pensar en obstrucción de la vía aérea por cuerpo extraño.",
      "Muchos ahogados se enfrían, incluso en verano: el agua recién es térmicamente neutra cerca de los 33 grados, así que hay que secarlos y abrigarlos. Pero la evaluación dura lo de siempre, hasta 10 segundos, y ante la duda se reanima. Sólo si estuvo en agua fría y está helado, el pulso y la respiración pueden ser tan lentos que cuesta detectarlos: ahí se mira hasta un minuto (ERC 2025).",
      "A la víctima hipotérmica se la maneja con suavidad: una maniobra brusca puede desencadenar una fibrilación. Se la saca del agua en posición horizontal si se puede, se le quita la ropa mojada y se la abriga.",
      "En hipotermia la desfibrilación puede no funcionar hasta que el cuerpo se recalienta. Por eso, en ahogamiento, no se da a nadie por muerto hasta que esté caliente.",
      "Sólo NO se inicia RCP si la escena es insegura, si hubo más de una hora de sumersión, o si hay rigidez cadavérica, livideces o descomposición. Ante cualquier duda, se reanima.",
      "Si recupera y vuelve a respirar solo, se maneja como grado 4 y se vigila de cerca: puede volver a caer en paro dentro de la media hora siguiente. Posición lateral de seguridad y, si hay DEA, los parches quedan puestos.",
      "Agua dulce y agua salada se tratan igual. (En la revisión de Quan 2016 el agua salada tuvo un pronóstico apenas mejor, pero no cambia nada de lo que se hace ni del despacho.) Si el alumno hace esa distinción, no cambia nada de lo que le indicás.",
      "Lo que más pesa en el pronóstico es el tiempo bajo el agua: con menos de 5 o 6 minutos el pronóstico es bueno, y pasados los 25 casi siempre es fatal. Por eso te importa el tiempo de sumersión, aunque sea aproximado.",
      "La lesión de columna en un ahogado es rarísima si no hubo un golpe (0,5% en la serie de Watson 2001, siempre con zambullida, caída de altura o choque). Sin ese antecedente no se inmoviliza de rutina, y nunca se demora la ventilación por cuidar el cuello.",
      "Hidrocución o síndrome de inmersión: entrada brusca a agua fría que dispara una arritmia y puede terminar en síncope o paro. Es un mecanismo distinto del ahogamiento por cansancio, y se pregunta cómo entró al agua.",
      "En chicos, el ritmo desfibrilable es todavía más raro que en adultos, pero igual se usa el DEA apenas esté disponible, con parches pediátricos si los hay."
    ],
    escala: [
      "RESCATE: salió vivo del agua, no tose ni tiene espuma. No es ahogamiento.",
      "GRADO 1: tose, sin espuma. Reposo, abrigo, tranquilizar. Mortalidad 0%.",
      "GRADO 2: poca espuma en boca o nariz. O2 5 l/min por cánula nasal y posición lateral de seguridad. Mortalidad 0,6%.",
      "GRADO 3: mucha espuma, CON pulso radial. O2 15 l/min con máscara y PLS. Mortalidad 5,2%.",
      "GRADO 4: mucha espuma, SIN pulso radial. O2 15 l/min con máscara y vigilancia estrecha: puede caer en paro. Mortalidad 19,4%.",
      "GRADO 5: paro respiratorio. Vía aérea permeable, 5 ventilaciones de rescate y después ventilación artificial; controlar el pulso carotídeo seguido, porque puede pasar a grado 6. Mortalidad 44%.",
      "GRADO 6: paro cardiorrespiratorio. 5 ventilaciones de rescate, controlar signos de circulación y si no hay, RCP 30:2 a 100-120 por minuto, con DEA si hay. Reevaluar pulso y respiración cada 2 minutos. Si recupera, se maneja como grado 4 o 5 y se vigila, porque puede volver a parar. Mortalidad 93%.",
      "Ahogamiento primario (o 'puro'): no lo precipitó otra cosa. Secundario: lo precipitó alcohol, drogas, una convulsión, un traumatismo o un cuadro cardíaco."
    ],
    /* Acá quien llama es siempre el guardavidas en servicio, identificado por su puesto:
       no se le pide teléfono de contacto como a un testigo anónimo. */
    cambia: {
      identificacion:{ label:"Se identificó como guardavidas y dijo su puesto", peso:5,
        logrado:"Dijo su nombre, que es el guardavidas en servicio y desde qué puesto o sector llama.",
        parcial:"Se identificó por arriba, sin dejar claro que es el guardavidas del lugar ni desde dónde."}
    },
    checks: [
      {id:"sumersion", label:"Tiempo de sumersión", peso:8, critico:false,
       logrado:"Dio el tiempo aproximado que la víctima estuvo bajo el agua, aunque fuera estimado.",
       parcial:"Lo mencionó muy vago ('un rato', 'poco') sin un número aproximado."},
      {id:"clasificacion", label:"Clasificó la víctima o dio los signos para clasificarla", peso:12, critico:false,
       logrado:"Dio el grado directamente, o describió tos, espuma (poca o mucha) y pulso radial de manera que el operador pudo clasificar.",
       parcial:"Dio algún signo suelto, insuficiente para ubicar el grado."},
      {id:"maniobras", label:"Informó qué maniobras estaba haciendo", peso:10, critico:false,
       logrado:"Dijo qué venía haciendo y desde cuándo: ventilaciones de rescate, compresiones, cuántos ciclos o cuánto tiempo llevaba.",
       parcial:"Dijo que estaba atendiendo sin precisar qué maniobra ni desde cuándo."}
    ]
  },
  lego: {
    enLinea: true,
    esenciales: [],
    // Sólo para el ahogado que SÍ respira: si no respira, la RCP sale de listaRcp().
    indicaciones: [
      "Sacale la ropa mojada, secalo y abrigalo con lo que tengas a mano.",
      { si: "responde", di: "Que se quede acostado o sentado, quieto y tapado, aunque diga que está bien." },
      { si: "no responde pero respira normal", di: "Ponelo de costado, con la boca mirando al piso, por si vomita." },
      { si: "vomita", di: "Ponelo de costado y limpiale la boca con los dedos." },
      "Quedate al lado y mirá todo el tiempo que siga respirando normal."
    ],
    noHacer: [
      "Meterse al agua a buscar a otro sin poder hacerlo seguro.",
      "Apretarle la panza o ponerlo boca abajo para sacarle el agua: no sirve y hace perder tiempo.",
      "Dejarlo solo o dejarlo ir porque 'ya está bien'."
    ],
    alarma: "si tose sin parar, le falta el aire, se pone dormido o confundido, o deja de respirar normal",
    saber: [
      "En un ahogado, y en cualquier chico, el paro viene por falta de aire: por eso la RCP guiada empieza con 5 ventilaciones y sigue con 30 compresiones y 2 ventilaciones.",
      "Si quien llama no puede o no quiere ventilar, se le indica que haga sólo compresiones, sin parar: es mucho mejor que nada.",
      "Es habitual que el ahogado vomite: de costado, limpiar la boca, y seguir.",
      "Se lo seca y se lo abriga en cuanto se pueda: casi todo ahogado está frío.",
      "Aunque respire y diga que está bien, el que tragó agua puede empeorar en las horas siguientes: la ambulancia igual va."
    ],
    // Sólo sin paro. `ventilaciones` NO va acá: es CHECK_VENTILACIONES y se suma con paro.
    checks: [
      {id:"abrigo", label:"Lo secó y lo abrigó", peso:8, critico:false,
       logrado:"Dijo que le sacó la ropa mojada y lo abrigó, por su cuenta o apenas se lo indicaron.",
       parcial:"Lo abrigó recién cuando se lo repitieron, o no dijo si lo hizo."},
      {id:"tiempo_agua", label:"Cuánto estuvo en el agua", peso:6, critico:false,
       logrado:"Dijo cuánto tiempo estuvo bajo el agua, aunque fuera aproximado, o que no lo sabía.",
       parcial:"Lo dijo muy vago ('un rato') o recién después de varias preguntas."}
    ]
  }
};

/* Atragantamiento (obstrucción de la vía aérea por cuerpo extraño). Fuentes: AHA 2025
   Adult BLS (actualiza el atragantamiento del adulto), AHA/AAP 2025 Pediatric BLS (lactante:
   golpes en la espalda y compresiones en el pecho, sin abdominales), ERC 2025 First Aid y
   ERC 2025 BLS (si pierde el conocimiento, RCP; mirar la boca antes de ventilar). Reescrito
   de relevo/lego-preaviso.md y relevo/profesional.md. */
CASOS.atragantamiento = {
  id: "atragantamiento",
  nombre: "Atragantamiento",
  fam: "Vía aérea",
  provisorio: false,
  reconocer: "se atragantó comiendo o con un objeto: no puede toser ni hablar, se agarra el cuello, se le trabó algo en la garganta",
  rcp: null,
  fuentes: ["AHA 2025 Adult BLS", "AHA/AAP 2025 Pediatric BLS", "ERC 2025 First Aid", "ERC 2025 BLS", "ERC 2025 PLS"],
  guardavidas: {
    pide: { acciones: "si ya le dieron golpes en la espalda y compresiones abdominales (en un bebé, en el pecho), cuántas veces y si salió algo",
            material: "si hay un DEA cerca, por si pierde el conocimiento" },
    esenciales: [ {id:"tos", pide:"si puede toser, hablar o llorar, y si se está poniendo morado"} ],
    extras: [],
    clasificar: [
      "Lo que define todo es si la obstrucción es leve o grave: si tose fuerte, habla o llora, es leve; si no puede toser, hablar ni respirar, o se pone morado, es grave.",
      "Después, qué ya le hicieron y si salió algo. Un guardavidas sabe las maniobras: no se las dictes, preguntá si ya las está haciendo.",
      "Si te dice que dejó de responder, preguntá si respira normalmente y si ya empezó la RCP: pasa a ser un paro."
    ],
    saber: [
      "Tos fuerte es obstrucción leve: se lo alienta a toser y no se le hace nada más; los golpes pueden empeorarla.",
      "Obstrucción grave en adulto o chico: 5 golpes en la espalda, inclinado hacia adelante, y 5 compresiones abdominales, alternando hasta que salga o pierda el conocimiento.",
      "En el lactante: 5 golpes en la espalda boca abajo sobre el antebrazo y 5 compresiones en el pecho. Nunca compresiones abdominales en un bebé.",
      "En una embarazada avanzada o en alguien muy obeso, las compresiones van en el pecho en vez de en la panza.",
      "Si pierde el conocimiento: al piso y RCP. Antes de cada ventilación se mira la boca y se saca el objeto sólo si se ve; nunca se barre la boca a ciegas.",
      "Quien recibió compresiones abdominales tiene que verlo un médico aunque se haya destrabado: pueden lastimar por dentro. El móvil va igual."
    ],
    escala: [],
    cambia: {
      material:{ label:"Qué material tienen, por si pierde el conocimiento",
        logrado:"Dijo si hay un DEA cerca y quién lo trae, o que no hay, y con qué cuentan para ventilar si hiciera falta.",
        parcial:"Habló del material sólo cuando se lo preguntaron y sin precisar."}
    },
    checks: [
      {id:"obstruccion", label:"Dijo si la obstrucción es leve o grave", peso:10, critico:false,
       logrado:"Dijo si es leve o grave, o dio los signos para saberlo: si tose fuerte, si habla o llora, si se pone morado.",
       parcial:"Dijo 'se ahoga' o 'se atragantó' sin decir si tose ni si puede hablar."},
      {id:"maniobras", label:"Informó qué maniobras hizo", peso:10, critico:false,
       logrado:"Dijo qué hizo y cuántas veces (golpes en la espalda, compresiones abdominales o en el pecho) y si salió el objeto.",
       parcial:"Dijo que lo estaba atendiendo sin precisar qué hizo ni si salió algo."}
    ]
  },
  lego: {
    enLinea: true,
    esenciales: [ {id:"tos", pide:"si puede toser, hablar o llorar"} ],
    /* Las de adulto y chico son iguales, así que van con una condición clínica ("no es un
       bebé") en vez de con el filtro de víctima: con dos ramas por edad no entraban en el
       máximo de seis. Las del bebé sí van con "lactante" para que la app las filtre. */
    indicaciones: [
      { si: "tose fuerte, habla o llora", di: "Que siga tosiendo fuerte. Mientras tosa bien, no le pegues ni le hagas nada." },
      { si: "no puede toser ni hablar, y no es un bebé", di: "Inclinalo para adelante y dale 5 golpes fuertes en la espalda, entre los omóplatos, con el talón de la mano." },
      { si: "no puede toser ni hablar, y no es un bebé", di: "Si no salió, abrazalo desde atrás, poné el puño arriba del ombligo y tirá fuerte hacia adentro y arriba, 5 veces. Después alterná 5 golpes y 5 apretones hasta que salga." },
      { si: "lactante", di: "Si no llora ni tose: ponelo boca abajo sobre tu antebrazo, con la cabeza más baja, sosteniéndole la cara, y dale 5 golpes en la espalda con el talón de la mano." },
      { si: "lactante", di: "Dalo vuelta boca arriba y empujá 5 veces en el medio del pecho, justo debajo de la línea de las tetillas, con el talón de una mano o con los dos pulgares. Nunca en la panza. Alterná 5 y 5 hasta que salga." },
      "Si deja de responder, acostalo boca arriba en el piso y avisame enseguida."
    ],
    noHacer: [
      "Darle agua o pan para que baje.",
      "Meterle los dedos en la boca a ciegas: sólo se saca lo que se ve.",
      "Pegarle en la espalda mientras tose fuerte.",
      "En un bebé, apretarle la panza o colgarlo de los pies."
    ],
    alarma: "si le vuelve a costar respirar, si queda con tos o ruido al respirar, o si deja de responder",
    saber: [
      "Si tose fuerte, el cuerpo lo está resolviendo: se lo alienta a toser y nada más.",
      "Si no puede toser, hablar ni respirar, es grave: golpes en la espalda y compresiones en la panza, de a 5 y alternando (en un bebé, en el pecho), hasta que salga o deje de responder.",
      "Si deja de responder, es un paro: al piso y RCP guiada. Antes de cada soplido, mirar la boca y sacar el objeto sólo si se ve.",
      "Aunque se destrabe, al que le apretaron la panza lo tiene que ver un médico: la ambulancia sigue viniendo."
    ],
    checks: [
      {id:"obstruccion", label:"Contó si tose, habla o llora", peso:8, critico:false,
       logrado:"Dijo si puede toser, hablar o llorar, y si se estaba poniendo morado.",
       parcial:"Dijo 'se ahoga' sin más, y lo aclaró recién cuando se lo preguntaron."},
      {id:"desobstruccion", label:"Hizo las maniobras y avisó si salió", peso:10, critico:false,
       logrado:"Hizo los golpes y las compresiones cuando se los indicaron y avisó si salió el objeto; o, si tosía fuerte, lo dejó toser sin pegarle.",
       parcial:"Dudó mucho, paró antes de tiempo o no avisó si salió."}
    ]
  }
};

/* Paro cardiorrespiratorio. REGRESIÓN OBLIGATORIA (contrato 2.2): guardavidas hereda tal
   cual GUIAS.pcr y lego.saber hereda GUIAS["lego-rcp"]. Fuentes de lo heredado: ERC 2025
   BLS, AHA 2025 Adult BLS, Larsen 1993 (la supervivencia cae ~5,5 puntos por minuto sin
   tratamiento) y Valenzuela 1997. La RCP guiada del lego NO está acá: sale de RCP_* y
   listaRcp(). Se suma una línea al saber lego (no buscar el pulso), de AHA 2025 Systems of
   Care y ERC 2025 BLS. */
CASOS.paro = {
  id: "paro",
  nombre: "Paro cardiorrespiratorio",
  fam: "Paro",
  provisorio: false,
  reconocer: "no responde y no respira normalmente, o boquea, o ya le están haciendo RCP; cualquier causa que no sea agua, atragantamiento o parto",
  rcp: null,
  fuentes: ["ERC 2025 BLS", "AHA 2025 Adult BLS", "AHA 2025 Systems of Care", "Larsen 1993", "Valenzuela 1997"],
  guardavidas: {
    // Los `pide` de acciones y material de antes, que eran justamente los del paro.
    pide: { acciones: "qué están haciendo ya: si comprimen, si ventilan, desde hace cuánto",
            material: "con qué cuentan, sobre todo si tienen DEA en el lugar y si está colocado" },
    esenciales: [],
    extras: [
      {id:"dea_result", pide:"qué indicó el DEA, una vez que lo hayan colocado"}
    ],
    clasificar: [
      "En un paro no hay grados. Lo que te importa, en este orden: si lo vio desplomarse y hace cuánto, si ya están comprimiendo, y si hay un DEA en camino o colocado.",
      "Si te lo dio todo junto, que es lo que hace un entrenado, no lo repreguntes."
    ],
    saber: [
      "Colapso de golpe, no responde y no respira normalmente (o boquea) = paro. Unas sacudidas breves al principio pueden ser parte del paro, no una convulsión común.",
      "Lo que decide la supervivencia es cuánto se tarda en empezar la RCP y en dar la primera descarga: sin nada, la probabilidad de sobrevivir cae unos 5 puntos por cada minuto. Por eso el DEA es lo que más te importa del material.",
      "Un entrenado hace 30:2, a 100-120 compresiones por minuto y 5-6 cm de profundidad. Si no puede o no quiere ventilar, las compresiones solas son aceptables en el adulto.",
      "El DEA se coloca apenas llega, sobre el pecho desnudo y seco. Mientras analiza y descarga nadie toca a la víctima; después se sigue comprimiendo enseguida.",
      "Si recupera y respira normalmente: de costado, vigilar la respiración, y los parches quedan puestos porque puede volver a parar.",
      "Un guardavidas fuera de servicio no tiene puesto ni equipo: se identifica, deja un teléfono y reparte tareas a los testigos (uno al DEA, otro a esperar a la ambulancia)."
    ],
    escala: [],
    cambia: {},
    checks: [
      {id:"tiempo", label:"Si lo vio desplomarse y hace cuánto", peso:8, critico:false,
       logrado:"Dijo que lo vio desplomarse (o que no lo vio) y hace cuánto pasó, aunque fuera aproximado.",
       parcial:"Dio una de las dos cosas, o muy vago ('hace un rato')."},
      {id:"maniobras", label:"Informó qué maniobras estaba haciendo", peso:10, critico:false,
       logrado:"Dijo qué venía haciendo y desde cuándo: compresiones, ventilaciones, DEA colocado o en camino.",
       parcial:"Dijo que estaba atendiendo sin precisar qué hacía ni desde cuándo."}
    ]
  },
  lego: {
    enLinea: true,
    esenciales: [],
    indicaciones: [],      // la RCP guiada sale de RCP_* / listaRcp()
    noHacer: [
      "Buscarle el pulso.",
      "Parar de comprimir para ver si volvió.",
      "Comprimir sobre una cama o un colchón.",
      "Ponerle algo en la boca para que no se trague la lengua."
    ],
    alarma: "si vuelve a dejar de responder o de respirar normal",
    saber: [
      "En el adulto que se desploma, la RCP guiada por teléfono es sólo con compresiones: es más fácil de indicar y de hacer, y es lo que recomiendan las guías.",
      "Lo que más cambia el resultado es que empiece a comprimir rápido y que llegue un DEA. Cada minuto cuenta.",
      "La respiración agónica aparece en muchos paros, sobre todo al principio, y es la razón más común por la que un testigo cree que la persona respira.",
      "Nunca le pidas que le busque el pulso: con que no responda y no respire normal alcanza para empezar."
    ],
    checks: []
  }
};

/* Hemorragia grave. Lo clínico sale de AHA/Cruz Roja Primeros Auxilios 2024, ERC 2025
   Primeros Auxilios e ILCOR 2025 (presión directa primero; torniquete comercial en un
   miembro si la presión no alcanza; no sacar lo clavado), reescrito y no copiado. Por
   prudencia (contrato 2.2) el operador nunca indica un torniquete improvisado. */
CASOS.hemorragia = {
  id: "hemorragia",
  nombre: "Hemorragia grave",
  fam: "Trauma",
  provisorio: false,
  reconocer: "sangrado abundante que no para: chorro, charco, ropa empapada, herida de arma, amputación",
  rcp: null,
  fuentes: ["AHA/ARC First Aid 2024", "ERC 2025 First Aid", "ILCOR 2025 First Aid"],
  guardavidas: {
    pide: { acciones: "si ya están haciendo presión directa sobre la herida y con qué, y si pusieron torniquete y a qué hora",
            material: "si tienen botiquín, apósitos o gasas, guantes o un torniquete" },
    esenciales: [ {id:"sangrado", pide:"de dónde sangra y cuánto: si sale a chorro, si empapa, si cede con la presión"} ],
    extras: [],
    clasificar: [
      "Lo que mata rápido es la sangre que no para: de dónde sangra (brazo, pierna, cuello, tronco), si sale a chorro o empapa, y si cede con la presión.",
      "Después, si hay signos de shock: pálido, frío, sudoroso, confuso o adormecido.",
      "Si ya te dijo que comprime la herida y con qué, o que puso torniquete, no lo repreguntes: preguntá sólo a qué hora lo puso, si no lo dijo."
    ],
    saber: [
      "La presión directa, firme y sostenida sobre la herida es lo primero y en la mayoría de los casos alcanza. Si el apósito se empapa, se agrega otro encima sin levantar el primero.",
      "El torniquete es para brazo o pierna cuando la presión no alcanza, y comercial. Una vez puesto no se afloja: lo saca el hospital. La hora en que se puso es un dato para el SEM.",
      "En cuello, axila o ingle no hay torniquete: presión directa, o rellenar la herida con gasa (hemostática si hay) y apretar encima.",
      "Un objeto clavado no se saca: se aprieta alrededor y se lo fija para que no se mueva.",
      "Pálido, frío, sudoroso, con sed o confuso es shock: acostado, abrigado y nada por boca. Si además deja de responder, es un cambio que te tienen que avisar enseguida.",
      "Levantar el miembro no reemplaza a la presión: no cuenta como control del sangrado."
    ],
    escala: [],
    cambia: {
      material:{ label:"Qué material tienen para controlar el sangrado", peso:10,
        logrado:"Dijo con qué cuentan: apósitos o gasas, guantes, torniquete (y si ya está puesto), botiquín. Si no tienen nada, también lo dijo.",
        parcial:"Habló del material sólo cuando se lo preguntaron y sin precisar, o no aclaró si el torniquete estaba puesto." }
    },
    checks: [
      {id:"origen", label:"De dónde sangra y cuánto", peso:10, critico:false,
       logrado:"Dijo la zona (brazo, pierna, cuello, tronco), si sale a chorro o empapa, y si cede con la presión.",
       parcial:"Dijo 'sangra mucho' sin la zona ni cómo sale, o lo precisó recién cuando se lo preguntaron dos veces."},
      {id:"control", label:"Qué están haciendo para frenar el sangrado", peso:10, critico:false,
       logrado:"Dijo qué hacen y con qué: presión directa, relleno de la herida o torniquete, y si hay torniquete, a qué hora lo pusieron.",
       parcial:"Dijo que lo están atendiendo sin precisar qué hacen, o mencionó el torniquete sin la hora."}
    ]
  },
  lego: {
    enLinea: true,
    esenciales: [ {id:"sangrado", pide:"de dónde sangra y si sale mucho o a chorro"} ],
    indicaciones: [
      "Apretá fuerte sobre la herida con un trapo limpio, con las dos manos, y no sueltes.",
      "No levantes el trapo para mirar: si se empapa, poné otro encima y seguí apretando.",
      "Que se acueste en el piso y abrigalo, sin dejar de apretar.",
      { si: "tiene algo clavado en la herida", di: "No lo saques: apretá alrededor, sin empujarlo." },
      { si: "hay un torniquete comercial y es un brazo o una pierna que sigue sangrando aunque aprietes", di: "Poné el torniquete unos cinco centímetros arriba de la herida y ajustalo hasta que pare de sangrar. Mirá la hora y no lo aflojes." }
    ],
    noHacer: [
      "Improvisar un torniquete con un cinto, un cordón o una corbata.",
      "Aflojar un torniquete que ya está puesto.",
      "Levantar el brazo o la pierna en vez de apretar.",
      "Sacar un objeto clavado.",
      "Poner yerba, café, harina o polvos en la herida."
    ],
    alarma: "si vuelve a sangrar, se pone pálido y frío, se marea o deja de responder",
    saber: [
      "Apretar fuerte y sin soltar frena casi todos los sangrados: es lo primero y lo que más importa.",
      "El torniquete se indica sólo si hay uno comercial en el lugar y apretando no alcanza. Nunca le indiques improvisar uno.",
      "Pálido, frío, sudoroso o confundido es que perdió mucha sangre: acostado, abrigado y nada de comer ni de tomar.",
      "Quien aprieta no puede soltar para agarrar el teléfono: que lo ponga en altavoz o que otra persona hable."
    ],
    checks: [
      {id:"presion", label:"Apretó la herida sin soltar", peso:12, critico:false,
       logrado:"Dijo que apretaba fuerte sobre la herida cuando se lo indicaron, no soltó para mirar y avisó si seguía sangrando.",
       parcial:"Tardó en apretar, soltó para mirar o no avisó si el sangrado seguía."},
      {id:"zona_sangrado", label:"Dijo de dónde sangra", peso:8, critico:false,
       logrado:"Dijo de qué parte del cuerpo sangra y si sale mucho o a chorro.",
       parcial:"Dijo 'sangra' sin decir de dónde, o lo dijo recién después de varias preguntas."}
    ]
  }
};

/* Anafilaxia. Lo clínico sale de ERC 2025 Primeros Auxilios (Djärv, Resuscitation 2025,
   10.1016/j.resuscitation.2025.110752), AHA/Cruz Roja Primeros Auxilios 2024 (Hewett
   Brumberg, Circulation 2024) y circunstancias especiales de ERC y AHA 2025, reescrito.
   Corrección del instructor (noviembre de 2026): el operador nunca indica medicación, ni
   siquiera el autoinyector propio. Sólo pregunta si lo tiene y si ya se usó, y a qué hora. */
CASOS.alergia = {
  id: "alergia",
  nombre: "Reacción alérgica grave",
  fam: "Vía aérea",
  provisorio: false,
  reconocer: "alérgico con hinchazón de cara, labios o lengua, o ronchas con falta de aire o desmayo, tras picadura, comida o remedio",
  rcp: null,
  fuentes: ["ERC 2025 First Aid", "AHA/ARC First Aid 2024", "ERC 2025 Special Circumstances", "AHA 2025 Special Circumstances"],
  guardavidas: {
    pide: { acciones: "si ya le aplicaron adrenalina con autoinyector y a qué hora, y en qué posición lo tienen",
            material: "si la víctima tiene su autoinyector de adrenalina y si ya se usó (cuántas dosis y a qué hora), y si hay un DEA ubicado" },
    esenciales: [ {id:"desencadenante", pide:"qué lo provocó (picadura, comida, remedio) y hace cuánto"} ],
    extras: [],
    clasificar: [
      "Lo que define la gravedad: hinchazón de cara, labios o lengua; voz ronca, silbido o dificultad para tragar o respirar; mareo, palidez o desvanecimiento. Ronchas solas, sin nada de eso, no es anafilaxia.",
      "Después: si ya se aplicó la adrenalina, cuántas dosis y a qué hora, y cómo lo tienen.",
      "Si te lo dio todo junto, no lo repreguntes."
    ],
    saber: [
      "Anafilaxia = reacción alérgica que compromete la vía aérea, la respiración o la circulación. Va con prioridad máxima aunque haya mejorado.",
      "No se frena sola ni se espera a ver si se le pasa: va con prioridad máxima. Si te preguntan si le ponen su lapicera o le dan un antialérgico, no lo indicás ni lo desaconsejás: decís que eso lo evalúa el equipo de la ambulancia y preguntás si ya se aplicó algo y a qué hora.",
      "Posición: sentado si le falta el aire; acostado boca arriba si está mareado, pálido o se desvanece, sin levantarle las piernas. Nunca de pie ni caminando: levantarlo de golpe puede precipitar el paro.",
      "Puede volver a empeorar horas después aunque haya mejorado: siempre va al hospital.",
      "No indicás ni sugerís medicación, tampoco el autoinyector propio: sólo preguntás si lo tiene, si ya se lo aplicaron y a qué hora. Oxígeno no se le pregunta ni se le indica."
    ],
    escala: [],
    cambia: {
      material: { label: "Qué material tienen: autoinyector y DEA",
        logrado: "Dijo si la víctima tiene su autoinyector de adrenalina y si ya se usó (cuántas dosis y a qué hora), y si hay un DEA ubicado por si empeora. Si no hay autoinyector, también lo dijo.",
        parcial: "Habló del autoinyector sólo cuando se lo preguntaron, o no aclaró si ya se había usado." }
    },
    checks: [
      {id:"signos_alergia", label:"Describió la reacción con signos observables", peso:10, critico:false,
       logrado:"Dijo cómo está la vía aérea y la respiración (hinchazón de cara, labios o lengua, voz ronca, silbido, le cuesta tragar o respirar) y si hay mareo, palidez o desvanecimiento.",
       parcial:"Dijo 'tiene una reacción alérgica' o 'se hinchó' sin precisar respiración ni circulación."},
      {id:"adrenalina", label:"Si se aplicó la adrenalina y a qué hora", peso:10, critico:false,
       logrado:"Dijo si ya se aplicó el autoinyector, cuántas dosis y a qué hora, o que no tenían.",
       parcial:"Dijo que se la pusieron sin decir cuándo, o lo aclaró recién cuando se lo preguntaron dos veces."},
      {id:"desencadenante", label:"Qué la provocó", peso:6, critico:false,
       logrado:"Dijo qué la provocó (picadura, comida, remedio) y hace cuánto, o que no se sabe.",
       parcial:"Lo dijo sin el tiempo, o recién cuando se lo preguntaron."}
    ]
  },
  lego: {
    enLinea: true,
    esenciales: [ {id:"autoinyector", pide:"si la persona tiene su lapicera de adrenalina y si ya se la puso"} ],
    indicaciones: [
      { si: "le falta el aire", di: "Dejalo sentado, que no se acueste." },
      { si: "está mareado, pálido o se desvanece", di: "Acostalo boca arriba y que no se levante." },
      "No lo dejes pararse ni caminar, aunque diga que está mejor.",
      "Quedate con él y avisame enseguida si le cuesta más respirar o se desvanece."
    ],
    noHacer: [
      "Esperar a ver si se le pasa en vez de esperar a la ambulancia.",
      "Pararlo o hacerlo caminar.",
      "Darle remedios por su cuenta, sean de otra persona o de ella.",
      "Darle de comer o de beber."
    ],
    alarma: "si le cuesta cada vez más respirar, si se desvanece o si deja de responder",
    saber: [
      "No indicás ni sugerís ningún remedio, tampoco su lapicera de adrenalina: sólo preguntás si la tiene, si ya se la puso y a qué hora.",
      "La ambulancia va siempre, aunque mejore: la reacción puede volver.",
      "Si deja de responder y no respira normalmente, es un paro."
    ],
    checks: [
      {id:"autoinyector", label:"Dijo si tiene su autoinyector y si ya se usó", peso:10, critico:false,
       logrado:"Dijo si la persona tiene su lapicera de adrenalina y, si la tiene, si ya se la pusieron y a qué hora. Si no tiene, lo dijo.",
       parcial:"Lo dijo recién cuando se lo preguntaron varias veces, o no aclaró si ya se había usado."},
      {id:"antecedente_alergia", label:"Dijo qué la provocó o que es alérgico", peso:6, critico:false,
       logrado:"Contó qué pasó antes (una picadura, algo que comió, un remedio) o que la persona es alérgica.",
       parcial:"Lo dijo recién cuando se lo preguntaron varias veces."}
    ]
  }
};

/* Parto inminente o recién nacido. Lo clínico sale de ERC 2025 Primeros Auxilios y
   Soporte Vital Pediátrico (el recién nacido pierde calor: secar y abrigar; si no
   respira, ventilaciones primero) y AHA/AAP 2025 Pediátrica. Por prudencia (contrato
   2.2): recibir sin tirar, secar y abrigar; no cortar el cordón; si el bebé no
   respira, se trata como el paro de un lactante (la RCP sale de listaRcp(), no de acá).
   Validar todo con el instructor: no hay un capítulo de parto en las fuentes revisadas. */
CASOS.parto = {
  id: "parto",
  nombre: "Parto",
  fam: "Obstétrico",
  provisorio: false,
  reconocer: "parto inminente: rompió bolsa con pujos, contracciones muy seguidas, se ve la cabeza, o el bebé ya nació",
  rcp: null,
  // Las guías citadas respaldan sólo lo del recién nacido que no respira (paro de
  // lactante). Lo obstétrico (recibir sin tirar, secar, abrigar, no cortar el cordón) es
  // prudencia del proyecto, pendiente de validar con un instructor: por eso la última clave.
  fuentes: ["ERC 2025 Paediatric Life Support (si el bebé no respira)", "AHA/AAP 2025 Pediatric BLS (si el bebé no respira)", "Prudencia del proyecto (sin fuente obstétrica)"],
  guardavidas: {
    pide: { acciones: "qué están haciendo: si la tienen acostada y preparada, o si el bebé ya nació y lo secaron y abrigaron",
            material: "si tienen toallas o mantas limpias, guantes y botiquín" },
    esenciales: [ {id:"inminencia", pide:"si ya se ve la cabeza o tiene pujos, cada cuánto vienen las contracciones y de cuántas semanas está"} ],
    extras: [],
    clasificar: [
      "Lo primero es si es inminente: se ve la cabeza, tiene pujos que no puede frenar, o el bebé ya nació. Si es así, el parto es ahí.",
      "Después: de cuántas semanas está, si rompió bolsa y de qué color era el líquido, si sangra, si es el primer parto.",
      "Si ya nació: si el bebé llora o respira, si lo secaron y abrigaron, y cómo está la mamá (sangrado, conciencia)."
    ],
    saber: [
      "El bebé sale con los pujos: se lo recibe, no se tira de la cabeza ni del cuerpo.",
      "El recién nacido pierde calor muy rápido: se lo seca entero enseguida, se cambia la toalla mojada por una seca, se le cubre la cabeza y va piel con piel sobre la mamá.",
      "El cordón no se corta ni se ata en el lugar: espera al SEM. La placenta sale sola y no se tira de ella.",
      "Si el bebé no llora ni respira después de secarlo y frotarle la espalda, es el paro de un lactante: ventilaciones primero.",
      "Si lo que asoma primero no es la cabeza (cola, pies o el cordón), o la mamá sangra mucho, es una complicación: es un dato que te tienen que dar enseguida.",
      "Un parto antes de tiempo es un bebé más frágil, y un líquido verde o marrón es un dato para el SEM."
    ],
    escala: [],
    cambia: {
      material:{ label:"Qué material tienen para recibir al bebé", peso:10,
        logrado:"Dijo con qué cuentan: toallas o mantas limpias y secas, guantes, botiquín. Si no tienen, también lo dijo.",
        parcial:"Habló del material sólo cuando se lo preguntaron y sin precisar." }
    },
    checks: [
      {id:"datos_obstetricos", label:"Si es inminente y de cuántas semanas", peso:10, critico:false,
       logrado:"Dijo si se ve la cabeza o tiene pujos, cada cuánto las contracciones, de cuántas semanas está, si rompió bolsa y si sangra.",
       parcial:"Dijo 'está por tener el bebé' con uno solo de esos datos."},
      {id:"recien_nacido", label:"Cómo está el bebé y la mamá", peso:10, critico:false,
       logrado:"Avisó apenas nació, si llora o respira, si lo secaron y abrigaron, y cómo está la mamá. Si todavía no nació al cortar, dijo que está preparado para recibirlo.",
       parcial:"Avisó que nació sin decir si respira o llora, o no dijo cómo está la mamá."}
    ]
  },
  lego: {
    enLinea: true,
    esenciales: [ {id:"inminencia", pide:"si ya se ve la cabeza o tiene ganas de pujar, cada cuánto vienen las contracciones, y de cuántos meses está"} ],
    indicaciones: [
      "Que se acueste boca arriba con las rodillas dobladas, sobre toallas o sábanas limpias.",
      "Prepará toallas secas y algo para abrigar al bebé, y lavate las manos si podés.",
      "Cuando salga la cabeza, sostenela por abajo con las manos, sin tirar: el bebé sale solo con los pujos.",
      "Apenas nazca, secalo entero con una toalla y cambiala por una seca, tapándole también la cabeza.",
      "Ponelo sobre el pecho de la mamá, piel con piel, y tapalos a los dos. No cortes el cordón.",
      { si: "el bebé no llora ni respira después de secarlo", di: "Frotale la espalda y las plantas de los pies. Si sigue sin respirar, decímelo y te ayudo a hacerlo respirar." }
    ],
    noHacer: [
      "Tirar de la cabeza o del cuerpo del bebé.",
      "Cortar o tirar del cordón.",
      "Tirar de la placenta: sale sola, y se guarda para la ambulancia.",
      "Dejar al bebé mojado o sin tapar.",
      "Bañar al bebé."
    ],
    alarma: "si la mamá sangra mucho, se marea o se desmaya, o si el bebé deja de llorar o de respirar",
    saber: [
      "Casi siempre el bebé sale solo: la tarea es recibirlo, no sacarlo.",
      "Lo que más le pasa a un recién nacido es enfriarse: secarlo y abrigarlo enseguida, con la cabeza tapada, sobre la mamá.",
      "Si el bebé no respira después de secarlo y frotarlo, es el paro de un bebé: la RCP empieza con soplidos.",
      "El cordón no se corta: lo resuelve la ambulancia.",
      "Si lo que asoma no es la cabeza (cola, pies o el cordón), que no tire de nada y que te avise."
    ],
    checks: [
      {id:"siguio_guia", label:"Recibió al bebé como le indicaron", peso:12, critico:false,
       logrado:"Recibió sin tirar, secó y abrigó al bebé y lo puso sobre la mamá cuando se lo indicaron, o dijo que estaba todo preparado si todavía no nació.",
       parcial:"Siguió las indicaciones a medias o tarde: no lo secó, no lo abrigó o tiró de algo."},
      {id:"aviso_bebe", label:"Avisó cómo estaban el bebé y la mamá", peso:8, critico:false,
       logrado:"Avisó si el bebé lloraba o respiraba y cómo estaba la mamá, sin que se lo tuvieran que preguntar más de una vez.",
       parcial:"Lo dijo recién después de varias preguntas, o sólo de uno de los dos."}
    ]
  }
};

/* Sospecha de ACV. ERC 2025 y AHA/Cruz Roja 2024 Primeros Auxilios (reconocimiento con
   escalas tipo FAST, nada por boca, hora de inicio); Oostema 2016 (los despachadores
   reconocen entre el 41 y el 83% de los ACV, de ahí que se busquen los signos uno por uno). */
CASOS.acv = {
  id: "acv",
  nombre: "Sospecha de ACV",
  fam: "Neurológico",
  provisorio: false,
  reconocer: "de golpe: boca torcida, un brazo que no levanta, habla trabada o rara, medio cuerpo dormido, ACV",
  rcp: null,
  fuentes: ["ERC 2025 First Aid", "AHA/ARC First Aid 2024", "Oostema 2016"],
  guardavidas: {
    pide: { acciones: "si lo tienen quieto y sin darle nada por boca",
            material: "si tienen glucómetro y si le midieron la glucemia" },
    esenciales: [ {id:"hora_inicio", pide:"a qué hora empezó, o a qué hora lo vieron bien por última vez"} ],
    extras: [ {id:"medicacion_acv", pide:"si toma anticoagulantes y si es diabético"} ],
    clasificar: [
      "Buscá los tres signos, con su lado: cara caída o torcida al sonreír, un brazo que no levanta o se le cae, habla trabada o que no se entiende.",
      "La hora en que empezó, o la última vez que lo vieron bien, es el dato que más cambia el destino. Sin hora exacta, pedí una referencia ('antes de almorzar').",
      "Después: si está despierto y si va empeorando."
    ],
    saber: [
      "El tratamiento que destapa la arteria sirve sólo en las primeras horas: por eso la hora de inicio vale tanto y el ACV va con prioridad.",
      "Si se despertó así, la hora que vale es la última vez que lo vieron bien, no la hora en que lo encontraron.",
      "Signos que van y vienen en minutos también se despachan como ACV: pueden anunciar uno mayor.",
      "El azúcar baja puede imitar un ACV: en un diabético importa si le midieron la glucemia.",
      "Nada por boca, ni agua ni pastillas: puede no tragar bien. Si se adormece o vomita, de costado y vigilar la respiración.",
      "No indicás medicación, tampoco aspirina: un ACV puede ser un sangrado. Oxígeno no se le pregunta ni se le indica."
    ],
    escala: [],
    cambia: {
      material: { label: "Qué tienen en el lugar: glucómetro",
        logrado: "Dijo si tienen glucómetro y, si lo midieron, qué valor dio; o que no tienen.",
        parcial: "Lo mencionó sin aclarar si midieron, o recién cuando se lo preguntaron." }
    },
    checks: [
      {id:"signos_focales", label:"Describió los signos de un lado", peso:12, critico:false,
       logrado:"Dijo qué ve en la cara, en los brazos y en el habla, y de qué lado.",
       parcial:"Dijo 'está raro' o 'habla mal' sin los signos ni el lado."},
      {id:"hora_acv", label:"Hora de inicio o última vez visto bien", peso:12, critico:false,
       logrado:"Dio una hora concreta, o 'lo vi bien a las…', o una referencia que permite calcularla.",
       parcial:"Dijo 'hace un rato' o 'no sé' sin intentar una referencia."}
    ]
  },
  lego: {
    enLinea: false,
    esenciales: [ {id:"hora_inicio", pide:"a qué hora empezó, o a qué hora lo vieron bien por última vez"} ],
    indicaciones: [
      "No le des nada de comer ni de tomar, ni agua ni pastillas.",
      { si: "está despierto", di: "Dejalo sentado o recostado, cómodo, y que no camine." },
      { si: "está muy dormido o vomita", di: "Ponelo de costado y fijate que respire normal." },
      "Juntá los remedios que toma y tenelos a mano para la ambulancia."
    ],
    noHacer: [
      "Darle aspirina u otro remedio.",
      "Esperar a ver si se le pasa.",
      "Llevarlo en auto por su cuenta sin avisar."
    ],
    alarma: "si se duerme, vomita, convulsiona o empeora",
    saber: [
      "Preguntá por los signos uno por uno: si sonríe, ¿se le tuerce la boca?; si levanta los dos brazos, ¿se le cae uno?; ¿habla raro?",
      "La hora en que empezó es lo más importante: si se despertó así, vale la última vez que lo vieron bien.",
      "Aunque se le pase en unos minutos, la ambulancia va igual."
    ],
    checks: [
      {id:"que_vio", label:"Contó lo que vio", peso:10, critico:false,
       logrado:"Contó lo que ve: la cara torcida, un brazo que no levanta, el habla rara.",
       parcial:"Dijo 'está raro' o 'le dio un ACV' sin contar lo que ve."},
      {id:"hora_lego", label:"Dijo a qué hora empezó", peso:10, critico:false,
       logrado:"Dio una hora, o cuándo lo vio bien por última vez.",
       parcial:"Dijo 'hace un rato' sin intentar precisarlo."}
    ]
  }
};

/* Dolor de pecho (sospecha de infarto). ERC 2025 y AHA/Cruz Roja 2024 Primeros Auxilios,
   reescrito. Apartado a propósito de la guía: ERC sugiere aspirina masticada en el adulto
   con dolor de pecho, pero el contrato pide que el operador no indique medicación que
   no validó el instructor. A validar. */
CASOS.pecho = {
  id: "pecho",
  nombre: "Dolor de pecho",
  fam: "Cardiovascular",
  provisorio: false,
  reconocer: "consciente con dolor, opresión o peso en el pecho, que puede irse al brazo, la mandíbula o la espalda, con sudor frío; 'infarto' hablando",
  rcp: null,
  fuentes: ["ERC 2025 First Aid", "AHA/ARC First Aid 2024"],
  guardavidas: {
    pide: { acciones: "si lo tienen en reposo y si tomó algún remedio",
            material: "si hay un DEA en el lugar y si lo tienen a mano" },
    esenciales: [ {id:"inicio_dolor", pide:"desde cuándo le duele"} ],
    extras: [ {id:"antecedentes_card", pide:"si es cardíaco o tiene antecedentes, y qué medicación toma"} ],
    clasificar: [
      "Cómo es el dolor: opresión, peso o ardor; si se va al brazo, la mandíbula, el cuello o la espalda; si suda frío, le falta el aire, tiene náuseas o se marea.",
      "Desde cuándo, si empezó con esfuerzo o en reposo, la edad y los antecedentes cardíacos.",
      "Si te lo dio todo junto, no lo repreguntes."
    ],
    saber: [
      "Dolor opresivo con sudor, falta de aire o que se irradia = sospecha de infarto: prioridad máxima. Cuanto antes llega al hospital, más corazón se salva.",
      "En mujeres, mayores y diabéticos el infarto puede no doler en el pecho: falta de aire, náuseas, dolor de mandíbula o de espalda, cansancio raro.",
      "El riesgo inmediato es el paro: por eso importa que haya un DEA cerca, a mano y sin colocar mientras responda.",
      "Reposo: que no camine ni haga esfuerzo.",
      "No indicás medicación, tampoco aspirina: si te preguntan, que no le den nada por su cuenta, lo decide el equipo del móvil. Oxígeno no se le pregunta ni se le indica."
    ],
    escala: [],
    cambia: {
      material: { label: "Qué material tienen: el DEA a mano",
        logrado: "Dijo si hay un DEA en el lugar y que lo tienen cerca, listo por si deja de responder; si no hay, también lo dijo.",
        parcial: "Mencionó el DEA sin aclarar si está a mano, o recién cuando se lo preguntaron." }
    },
    checks: [
      {id:"caracteristicas_dolor", label:"Describió el dolor", peso:12, critico:false,
       logrado:"Dijo cómo es el dolor, a dónde se va, desde cuándo y qué lo acompaña (sudor, falta de aire, náuseas, mareo).",
       parcial:"Dijo 'le duele el pecho' sin más datos, o los dio recién cuando se los preguntaron uno por uno."},
      {id:"antecedentes_card", label:"Antecedentes y medicación", peso:8, critico:false,
       logrado:"Dijo si es cardíaco o tiene antecedentes y qué toma, o que no sabe.",
       parcial:"Lo dijo a medias o recién cuando se lo preguntaron dos veces."}
    ]
  },
  lego: {
    enLinea: false,
    esenciales: [],
    indicaciones: [
      "Sentalo o recostalo como esté más cómodo, y que no camine ni haga fuerza.",
      "Aflojale la ropa que le apriete: cinturón, corbata, el cuello de la camisa.",
      "No le des ningún remedio por tu cuenta: eso lo decide el médico de la ambulancia.",
      "Si hay un desfibrilador cerca, que alguien lo traiga y lo deje al lado, sin ponérselo."
    ],
    noHacer: [
      "Hacerlo caminar, subir escaleras o manejar.",
      "Darle aspirina u otro remedio por cuenta propia.",
      "Esperar a ver si se le pasa."
    ],
    alarma: "si se desmaya, deja de responder o no respira normal",
    saber: [
      "Preguntá dónde le duele, si se le va al brazo, la mandíbula o la espalda, desde cuándo, y si suda o le falta el aire.",
      "El infarto no siempre duele en el pecho: también puede dar falta de aire, náuseas o dolor de mandíbula.",
      "No indicás ningún remedio, tampoco aspirina: si te la piden, decile que no le dé nada por su cuenta.",
      "Lo que más preocupa es que haga un paro: si deja de responder y no respira normalmente, se empieza la RCP."
    ],
    checks: [
      {id:"descripcion_dolor", label:"Contó cómo es el dolor", peso:10, critico:false,
       logrado:"Contó dónde le duele, desde cuándo y si suda, le falta el aire o se marea.",
       parcial:"Dijo 'le duele el pecho' o 'le da un infarto' sin contar nada más."},
      {id:"reposo", label:"Lo dejó en reposo", peso:6, critico:false,
       logrado:"Dijo que lo dejó sentado o recostado, sin caminar, cuando se lo indicaron.",
       parcial:"Lo hizo tarde, o lo dejó caminar o moverse."}
    ]
  }
};

/* Dificultad respiratoria (asma, EPOC). ERC 2025 Primeros Auxilios (asma), AHA 2025
   Circunstancias Especiales y la síntesis de despacho de relevo/profesional.md, reescrito.
   Medicación: ninguna, tampoco el inhalador propio; sólo se pregunta si lo usó. Oxígeno: no (correcciones del instructor). */
CASOS.respiratorio = {
  id: "respiratorio",
  nombre: "Dificultad para respirar",
  fam: "Vía aérea",
  provisorio: false,
  reconocer: "consciente y le falta el aire: asma, asmático, inhalador o puf, le silba el pecho, EPOC, labios morados hablando",
  rcp: null,
  fuentes: ["ERC 2025 First Aid", "AHA/ARC First Aid 2024", "AHA 2025 Special Circumstances"],
  guardavidas: {
    pide: { acciones: "en qué posición lo tienen y si ya usó su inhalador, cuántas veces",
            material: "si tiene a mano su inhalador de rescate y aerocámara" },
    esenciales: [ {id:"habla", pide:"si puede decir frases enteras o sólo palabras sueltas"} ],
    extras: [ {id:"antecedente_resp", pide:"si es asmático, tiene EPOC u otra enfermedad respiratoria conocida"} ],
    clasificar: [
      "Lo que mide la gravedad: si dice una frase entera o sólo palabras, el color de los labios, si se le hunden las costillas o usa los músculos del cuello, y si está agotado o somnoliento.",
      "Cómo empezó: de a poco, o de golpe comiendo o jugando, o después de una picadura o una comida. Lo brusco puede ser otra cosa y cambia lo que preguntás.",
      "Si te lo dio todo junto, no lo repreguntes."
    ],
    saber: [
      "No poder decir una frase entera, el agotamiento o la somnolencia indican crisis grave aunque esté consciente: prioridad máxima.",
      "Sentado, erguido y un poco inclinado hacia adelante es como mejor respira; acostarlo lo empeora.",
      "En una crisis de asma, un pecho que deja de silbar en alguien agotado no es mejoría: puede ser que ya casi no mueva aire.",
      "La ansiedad puede dar falta de aire, pero no se asume: primero se descarta lo grave con los mismos datos.",
      "No indicás ni sugerís medicación, tampoco su inhalador: sólo preguntás si lo usó y cuántas veces. Oxígeno no se le pregunta ni se le indica: no está en el alcance del guardavidas."
    ],
    escala: [],
    cambia: {
      material: { label: "Qué tienen en el lugar: su inhalador",
        logrado: "Dijo si la víctima tiene su inhalador de rescate (y aerocámara) y si ya lo usó; si no lo tiene, también lo dijo.",
        parcial: "Habló del inhalador sólo cuando se lo preguntaron, o no aclaró si lo usó." }
    },
    checks: [
      {id:"trabajo_resp", label:"Describió cuánto le cuesta respirar", peso:12, critico:false,
       logrado:"Dijo si habla frases enteras o palabras sueltas, el color, si se le hunden las costillas o usa el cuello, y si está agotado o confuso.",
       parcial:"Dijo 'le falta el aire' sin ningún dato que mida cuánto."},
      {id:"medicacion_resp", label:"Si usó su inhalador y cuántas veces", peso:8, critico:false,
       logrado:"Dijo si usó su inhalador, cuántas veces y si lo alivió, o que no tiene.",
       parcial:"Dijo que lo usó sin decir cuántas veces ni si lo alivió."},
      {id:"inicio_resp", label:"Cómo empezó y antecedentes", peso:6, critico:false,
       logrado:"Dijo si empezó de golpe o de a poco y si es asmático o tiene otra enfermedad respiratoria.",
       parcial:"Dio una de las dos cosas, o recién cuando se lo preguntaron."}
    ]
  },
  lego: {
    enLinea: false,
    esenciales: [ {id:"habla", pide:"si puede decir frases enteras o sólo palabras sueltas"} ],
    indicaciones: [
      "Sentalo derecho, un poco inclinado para adelante. No lo acuestes.",
      "Aflojale la ropa del cuello y del pecho.",
      "Hablale tranquilo para que respire despacio, y quedate con él."
    ],
    noHacer: [
      "Acostarlo.",
      "Darle remedios por su cuenta, sean de otra persona o de ella.",
      "Hacerlo respirar en una bolsa."
    ],
    alarma: "si no puede hablar, se pone azul o morado, se adormece o le cuesta cada vez más respirar",
    saber: [
      "Si puede decir una frase entera es la mejor medida de cuánto le cuesta: preguntalo y volvé a preguntarlo.",
      "No indicás ni sugerís ningún remedio, tampoco su inhalador: sólo preguntás si lo tiene y si ya lo usó.",
      "Si empezó de golpe comiendo o jugando, o con hinchazón de la cara, es otra cosa: preguntá qué pasó justo antes."
    ],
    checks: [
      {id:"descripcion_resp", label:"Contó cómo respira", peso:10, critico:false,
       logrado:"Contó lo que ve: si puede hablar, si tiene los labios morados, si le silba el pecho o se agita.",
       parcial:"Dijo 'le falta el aire' sin describir nada más."},
      {id:"inhalador", label:"Dijo si tiene su inhalador y si lo usó", peso:6, critico:false,
       logrado:"Dijo si la persona tiene su inhalador y si lo usó, o que no tiene.",
       parcial:"Lo dijo recién cuando se lo preguntaron varias veces."}
    ]
  }
};

/* Convulsión. ERC 2025 y AHA/Cruz Roja 2024 Primeros Auxilios, reescrito. Los 5 minutos
   como umbral de gravedad están en las dos guías de primeros auxilios. Lo de "sacudidas al
   desplomarse = paro" viene de la guía `pcr` de hoy. */
CASOS.convulsion = {
  id: "convulsion",
  nombre: "Convulsión",
  fam: "Neurológico",
  provisorio: false,
  reconocer: "convulsiona, se sacude entero, se puso rígido, ojos para atrás, epiléptico, se mordió la lengua, sacudidas con fiebre en un chico",
  rcp: null,
  fuentes: ["ERC 2025 First Aid", "AHA/ARC First Aid 2024"],
  guardavidas: {
    pide: { acciones: "si le protegen la cabeza y apartaron lo que lo pueda lastimar, y si al terminar lo pusieron de costado",
            material: "si hay un DEA ubicado por si al terminar no respira normalmente" },
    esenciales: [ {id:"duracion", pide:"si sigue convulsionando y hace cuánto empezó"} ],
    extras: [ {id:"antecedente_conv", pide:"si es epiléptico conocido, si tuvo fiebre o es diabético, y si se golpeó"} ],
    clasificar: [
      "Primero si sigue convulsionando y desde cuándo: más de 5 minutos, o una crisis tras otra sin despertarse, es grave.",
      "Cuando termina: si respira normalmente y si responde.",
      "Después la causa: epiléptico conocido, fiebre en un chico, diabetes, golpe, embarazo, alcohol o drogas. Si te cuentan que fue en el agua, preguntá si ya lo sacaron.",
      "Si te lo dio todo junto, no lo repreguntes."
    ],
    saber: [
      "Unas sacudidas breves al desplomarse, seguidas de respiración anormal, son un paro, no una convulsión.",
      "Durante la crisis no se sujeta ni se mete nada en la boca: la lengua no se traga.",
      "Lo habitual es que dure menos de 5 minutos y que después quede confuso o dormido un rato: eso es esperable.",
      "Más de 5 minutos, o crisis repetidas sin recuperar la conciencia, es prioridad máxima.",
      "Al terminar, de costado y vigilar que respire normalmente.",
      "La primera convulsión de la vida, en una embarazada, después de un golpe en la cabeza o en un diabético, siempre es grave.",
      "No indicás medicación. Oxígeno no se le pregunta ni se le indica."
    ],
    escala: [],
    cambia: {
      material: { label: "Qué tienen en el lugar",
        logrado: "Dijo con qué cuentan que sirva acá: algo para proteger la cabeza, glucómetro si es diabético, y si hay un DEA ubicado por si al terminar no respira normalmente.",
        parcial: "Habló del material sólo cuando se lo preguntaron y sin precisar." }
    },
    checks: [
      {id:"duracion_conv", label:"Cuánto duró o hace cuánto convulsiona", peso:10, critico:false,
       logrado:"Dijo si sigue convulsionando y hace cuánto empezó, o cuánto duró, aunque fuera aproximado.",
       parcial:"Dijo 'un rato' o 'bastante' sin un tiempo aproximado."},
      {id:"post_crisis", label:"Cómo quedó al terminar", peso:10, critico:false,
       logrado:"Dijo si respira normalmente, si responde y cómo lo tienen (de costado) cuando terminó la crisis.",
       parcial:"Dijo que terminó sin decir si respira normalmente."},
      {id:"causa_conv", label:"Antecedente o causa probable", peso:6, critico:false,
       logrado:"Dijo si es epiléptico, si tuvo fiebre, si es diabético o si se golpeó, o que no sabe.",
       parcial:"Lo dijo recién cuando se lo preguntaron dos veces."}
    ]
  },
  lego: {
    enLinea: true,
    esenciales: [ {id:"duracion", pide:"si sigue sacudiéndose y hace cuánto empezó"} ],
    indicaciones: [
      "Sacá de alrededor todo lo que lo pueda lastimar.",
      "Poné algo blando debajo de la cabeza, una campera o una toalla.",
      "No lo sujetes y no le metas nada en la boca.",
      "Mirá la hora y avisame cuando deje de sacudirse.",
      "Cuando pare, ponelo de costado y fijate que respire normal.",
      "Quedate con él y hablale tranquilo: puede tardar un rato en despertarse."
    ],
    noHacer: [
      "Meterle cosas en la boca: dedos, cuchara, pañuelo.",
      "Sujetarle los brazos o las piernas.",
      "Tratar de sacarle la lengua.",
      "Echarle agua en la cara o darle de beber."
    ],
    alarma: "si vuelve a convulsionar, si no se despierta o si no respira normal",
    saber: [
      "La lengua no se traga: meterle algo en la boca lastima y puede ahogarlo.",
      "Si dura más de 5 minutos, o vuelve a empezar sin que se despierte, es más grave: decíselo a quien llama sin asustarlo.",
      "Cuando para, lo que importa es que respire normalmente. Si no respira normal, es un paro.",
      "Es esperable que después quede dormido o confundido un rato."
    ],
    checks: [
      {id:"proteccion", label:"Lo protegió sin sujetarlo", peso:10, critico:false,
       logrado:"Hizo lo indicado: apartó lo peligroso, protegió la cabeza, no lo sujetó ni le metió nada en la boca, y lo puso de costado al terminar.",
       parcial:"Hizo una parte, o contó que le metió algo en la boca o lo sujetó."},
      {id:"aviso_conv", label:"Avisó cuándo terminó y cómo respira", peso:8, critico:false,
       logrado:"Avisó cuándo dejó de sacudirse, cuánto había durado y si respira normalmente.",
       parcial:"Avisó que terminó sin decir cómo respira, o recién cuando se lo preguntaron."}
    ]
  }
};

/* Hipoglucemia en un diabético. ERC 2025 y AHA/Cruz Roja 2024 Primeros Auxilios
   (azúcar por boca, 15 a 20 g, sólo si está despierto y traga; reevaluar a los 15
   minutos), reescrito. Las cantidades caseras ("un vaso de gaseosa común", "tres o
   cuatro cucharaditas") son una traducción a validar con el instructor. */
CASOS.glucemia = {
  id: "glucemia",
  nombre: "Azúcar baja en un diabético",
  fam: "Metabólico",
  provisorio: false,
  reconocer: "diabético confuso, sudoroso o raro, 'se le bajó el azúcar', insulina, hipoglucemia",
  rcp: null,
  fuentes: ["ERC 2025 First Aid", "AHA/ARC First Aid 2024"],
  guardavidas: {
    pide: { acciones: "si ya le dieron azúcar por boca, hace cuánto y si mejoró",
            material: "si tienen glucómetro, azúcar o bebida azucarada, y si la víctima tiene glucagón propio" },
    esenciales: [ {id:"diabetico", pide:"si es diabético, si se puso insulina y si comió"} ],
    extras: [ {id:"glucemia_valor", pide:"si le midieron la glucemia y qué valor dio"} ],
    clasificar: [
      "Lo que decide: si está despierto y puede tragar sin atragantarse. Separa al que se resuelve con azúcar del que no.",
      "Si es diabético, si usa insulina, si comió o hizo más ejercicio que de costumbre, y si le midieron la glucemia.",
      "Si ya le dieron azúcar: hace cuánto y si mejoró. Si te lo dio todo junto, no lo repreguntes."
    ],
    saber: [
      "Azúcar baja: confusión, sudor frío, temblor, palidez, conducta rara o agresiva, parece borracho. Puede terminar en convulsión o inconsciencia.",
      "Si está despierto y traga bien, el azúcar por boca (15 a 20 gramos) es el tratamiento, y la mejoría se ve en unos 15 minutos.",
      "Si no traga o no responde, nada por boca: de costado y vigilar la respiración.",
      "Si mejora, igual tiene que comer algo, y con algunas insulinas o pastillas el azúcar puede volver a bajar.",
      "No indicás medicación ni insulina. Si te cuentan que usaron su glucagón propio, preguntá a qué hora. Oxígeno no se le pregunta ni se le indica."
    ],
    escala: [],
    cambia: {
      material: { label: "Qué tienen en el lugar: glucómetro y azúcar",
        logrado: "Dijo si tienen glucómetro (y el valor si midieron), azúcar o bebida azucarada, y si la víctima tiene glucagón propio; si no tienen, también lo dijo.",
        parcial: "Habló del material sólo cuando se lo preguntaron y sin precisar." }
    },
    checks: [
      {id:"antecedente_glucemia", label:"Diabetes, insulina y glucemia", peso:10, critico:false,
       logrado:"Dijo que es diabético, si se puso insulina o no comió, y el valor de la glucemia si la midieron.",
       parcial:"Dijo 'es diabético' sin nada más, o lo dijo recién cuando se lo preguntaron."},
      {id:"deglucion", label:"Si traga y qué le dieron por boca", peso:10, critico:false,
       logrado:"Dijo si está despierto y traga, qué le dieron por boca (o que no le dieron nada porque no traga) y si mejoró.",
       parcial:"Dijo que le dieron azúcar sin aclarar si tragaba bien, o no dijo si mejoró."}
    ]
  },
  lego: {
    enLinea: false,
    esenciales: [ {id:"diabetico", pide:"si es diabético y si se puso insulina"} ],
    indicaciones: [
      { si: "está despierto, contesta y traga bien", di: "Dale azúcar ya: un vaso de gaseosa común o de jugo, que no sea light, o tres o cuatro cucharaditas de azúcar en un poco de agua." },
      { si: "ya tomó el azúcar", di: "Quedate con él unos quince minutos y decime si está mejor." },
      { si: "no traga, está muy dormido o no responde", di: "No le des nada por boca. Ponelo de costado y fijate que respire normal." },
      { si: "ya mejoró y está bien despierto", di: "Que coma algo, un pan o unas galletitas." }
    ],
    noHacer: [
      "Darle algo por boca si no traga bien o no responde.",
      "Ponerle insulina.",
      "Darle gaseosa light o con edulcorante.",
      "Dejarlo solo."
    ],
    alarma: "si no mejora, se duerme, convulsiona o deja de responder",
    saber: [
      "El azúcar baja da confusión, sudor, temblor y conducta rara: puede parecer borracho.",
      "Lo que decide es si traga bien: si traga, azúcar ya; si no, nada por boca y de costado.",
      "No indicás ningún remedio ni insulina."
    ],
    checks: [
      {id:"azucar", label:"Le dio azúcar sólo si tragaba", peso:10, critico:false,
       logrado:"Si estaba despierto y tragaba, le dio azúcar cuando se lo indicaron y avisó si mejoraba; si no tragaba, no le dio nada por boca y lo puso de costado.",
       parcial:"Le dio azúcar sin decir si tragaba bien, o no avisó cómo seguía."},
      {id:"diabetes_lego", label:"Dijo que es diabético", peso:6, critico:false,
       logrado:"Dijo que la persona es diabética y si se puso insulina o no comió, o que no sabía.",
       parcial:"Lo dijo recién cuando se lo preguntaron varias veces."}
    ]
  }
};

/* Intoxicación: pastillas, alcohol o drogas, productos de limpieza, monóxido (brasero,
   calefón), mordedura de víbora o picadura de alacrán (taxonomía §1). Lo clínico sale de
   ERC 2025 Primeros Auxilios, AHA/Cruz Roja 2024 y AHA 2025 Circunstancias Especiales
   (seguridad primero; no hacer vomitar; guardar el envase; lavar con agua; en la víbora,
   quieto y sin torniquete ni cortes). Por prudencia (contrato 2.2) NO lleva la naloxona
   ni el teléfono del centro de intoxicaciones: la primera no es medicación propia de la
   víctima, y el número no está verificado. */
CASOS.intoxicacion = {
  id: "intoxicacion",
  nombre: "Intoxicación",
  fam: "Tóxico / ambiental",
  provisorio: false,
  reconocer: "tomó pastillas, alcohol o drogas de más, un producto de limpieza o veneno; humo, gas, brasero o calefón; mordedura de víbora o picadura de alacrán, araña, abeja o avispa (sin reacción alérgica)",
  rcp: null,
  fuentes: ["ERC 2025 First Aid", "AHA/ARC First Aid 2024", "AHA 2025 Special Circumstances"],
  guardavidas: {
    pide: { acciones: "si ya lo sacaron del ambiente o lo alejaron de lo que tomó o tocó, y qué le hicieron",
            material: "si tienen el envase o la etiqueta, y si hay un DEA cerca" },
    esenciales: [ {id:"sustancia", pide:"qué tomó, tocó o respiró, cuánto y hace cuánto"} ],
    extras: [],
    clasificar: [
      "Primero la escena: olor a gas, humo, brasero o calefón, o varios afectados a la vez, es que nadie más entra y salen al aire libre. Eso va antes que cualquier pregunta clínica.",
      "Después qué fue, cuánto y hace cuánto. Si pudo ser a propósito, preguntalo sin rodeos.",
      "Lo que cambia el despacho: si está somnoliento, confuso, convulsiona, respira mal o no responde."
    ],
    saber: [
      "No se hace vomitar ni se da leche, aceite ni nada 'para cortarlo': empeora el daño y puede ir a los pulmones.",
      "El envase, el blíster o una foto de la etiqueta le sirven al SEM: que lo guarden.",
      "Químico en la piel o los ojos: sacar la ropa contaminada y lavar con mucha agua corriente; los ojos, por lo menos 15 minutos.",
      "El monóxido no huele. Varios con dolor de cabeza, mareo o vómitos en un lugar cerrado con brasero, calefón o estufa es monóxido hasta que se demuestre lo contrario.",
      "Respiración muy lenta, pupilas chiquitas y que no se despierta hace pensar en opioides: lo que manda es si respira normal.",
      "Mordedura o picadura (víbora, alacrán, araña): lo más simple. Quieto y en reposo hasta que llegue el SEM; lo que vale es lo que NO se hace: ni torniquete, ni cortes, ni succión, ni hielo, ni calor, ni alcohol, ni remedios, y nadie sale a buscar al animal (corrección del instructor).",
      "Picadura de alacrán: en un chico es más grave; sudor, vómitos o agitación son signos de alarma."
    ],
    escala: [],
    cambia: {
      material:{ label:"Qué saben del tóxico y con qué cuentan", peso:10,
        logrado:"Dijo si tienen el envase o la etiqueta, si el lugar es seguro, y si hay un DEA cerca o no.",
        parcial:"Lo dijo sólo cuando se lo preguntaron y sin precisar." }
    },
    checks: [
      {id:"toxico", label:"Qué sustancia, cuánto y hace cuánto", peso:10, critico:false,
       logrado:"Dijo qué tomó, tocó o respiró, una cantidad aproximada, hace cuánto, y si tienen el envase. Si no lo sabían, lo dijo.",
       parcial:"Dijo 'tomó algo' o 'pastillas' sin cantidad ni hora."},
      {id:"escena_toxico", label:"Si la escena es segura", peso:8, critico:false,
       logrado:"Avisó si había gas, humo o varios afectados, y qué hicieron (salir, ventilar, no volver a entrar), o dijo que el lugar era seguro.",
       parcial:"Lo mencionó al pasar o recién cuando se lo preguntaron."}
    ]
  },
  lego: {
    enLinea: false,
    esenciales: [ {id:"sustancia", pide:"qué tomó, tocó o respiró, cuánto y hace cuánto"} ],
    indicaciones: [
      { si: "es gas, humo, un brasero o un calefón", di: "Salgan todos afuera, al aire libre, y no vuelvan a entrar." },
      "Guardá el envase o la etiqueta de lo que tomó, para dárselo a la ambulancia.",
      { si: "le cayó en la piel o en los ojos", di: "Lavale con mucha agua de la canilla, sin parar, unos quince minutos." },
      { si: "lo mordió una víbora o lo picó un alacrán, una araña u otro bicho", di: "Que se quede quieto y tranquilo, sin mover el brazo o la pierna, hasta que llegue la ambulancia." },
      { si: "lo mordió una víbora o lo picó un alacrán, una araña u otro bicho", di: "No le hagas nada en la herida: ni torniquete, ni cortes, ni chupar, ni hielo. Tampoco le des alcohol ni remedios, y no vayan a buscar al bicho." }
    ],
    noHacer: [
      "Hacerlo vomitar.",
      "Darle leche, aceite, agua o cualquier cosa 'para cortarlo'.",
      "Echarle otro producto para neutralizar.",
      "Entrar a buscar a alguien a un lugar con gas o humo.",
      "En una mordedura o picadura: torniquete, cortar, chupar, poner hielo o calor, darle alcohol o remedios, o ir a buscar al animal."
    ],
    alarma: "si se duerme, no se despierta, convulsiona o le cuesta respirar",
    saber: [
      "No se hace vomitar ni se le da nada por boca: puede empeorar y el vómito puede irse a los pulmones.",
      "Con gas, humo o brasero, la seguridad va primero: nadie entra y todos afuera.",
      "El monóxido no huele: varios con dolor de cabeza o mareo en un lugar cerrado es una alarma.",
      "El envase o la etiqueta le dicen a la ambulancia qué fue."
    ],
    checks: [
      {id:"sustancia_dicha", label:"Dijo qué fue, cuánto y cuándo", peso:10, critico:false,
       logrado:"Dijo qué tomó, tocó o respiró, más o menos cuánto y hace cuánto, o dijo que no sabía en vez de inventar.",
       parcial:"Lo dijo a medias o recién después de varias preguntas."},
      {id:"seguridad_toxico", label:"Se cuidó y no hizo lo que empeora", peso:8, critico:false,
       logrado:"Si había gas o humo, salió y no volvió a entrar; no lo hizo vomitar ni le dio nada por boca; guardó el envase si se lo pidieron.",
       parcial:"Siguió las indicaciones con demora, o contó que le dio algo por boca antes de llamar y no lo repitió."}
    ]
  }
};

/* Golpe de calor e hipotermia. Lo clínico sale de ERC 2025 Primeros Auxilios y
   Circunstancias Especiales, AHA 2025 Circunstancias Especiales y AHA/Cruz Roja 2024
   (enfriar rápido en el lugar, inmersión en agua fría si se puede; en el frío, manejo
   suave, sacar lo mojado y abrigar). Las dos líneas de hipotermia marcada repiten lo que
   ya decía GUIAS.ahogamiento.saber del index.html anterior. Las indicaciones de lego van
   TODAS con `si` (contrato 2.2): calor y frío se excluyen. */
CASOS.temperatura = {
  id: "temperatura",
  nombre: "Golpe de calor o hipotermia",
  fam: "Ambiental",
  provisorio: false,
  reconocer: "golpe de calor (muy caliente, confuso o raro, al sol o haciendo ejercicio) o hipotermia (helado, tiritando o apagado, después de frío o agua fría)",
  rcp: null,
  fuentes: ["ERC 2025 First Aid", "ERC 2025 Special Circumstances", "AHA 2025 Special Circumstances", "AHA/ARC First Aid 2024"],
  guardavidas: {
    pide: { acciones: "si ya lo están enfriando (sombra, agua, hielo) o abrigando, según el caso, y desde hace cuánto",
            material: "si tienen agua fría, hielo y sombra, o mantas y manta térmica" },
    esenciales: [ {id:"exposicion", pide:"a qué estuvo expuesto y cuánto tiempo: sol, ejercicio con calor, agua fría, intemperie"} ],
    extras: [],
    clasificar: [
      "Primero de qué lado está: calor (sol, esfuerzo) o frío (agua fría, intemperie).",
      "Lo que cambia el despacho es la cabeza: confuso, raro, agresivo, convulsiona o no responde es grave, en los dos extremos.",
      "Calor: si la piel está muy caliente, si dejó de transpirar, si ya lo enfrían. Frío: si tirita o dejó de tiritar, si lo abrigan, si lo sacaron del agua horizontal."
    ],
    saber: [
      "Golpe de calor con la cabeza alterada es una emergencia: se enfría en el lugar, antes del traslado. Lo más eficaz es meterlo en agua fría del cuello para abajo; si no se puede, mojarlo entero y ventilarlo sin parar.",
      "Cansado, sudoroso y lúcido es agotamiento, no golpe de calor: sombra, reposo y líquido.",
      "Líquido por boca sólo si está lúcido y traga bien.",
      "Hipotermia: se lo maneja con suavidad y horizontal, porque una maniobra brusca puede desencadenar una fibrilación. Se saca la ropa mojada, se lo abriga con la cabeza incluida y no se lo frota.",
      "Si dejó de tiritar y está adormecido, la hipotermia es más profunda, no está mejorando.",
      "Sólo si está helado, el pulso y la respiración pueden ser tan lentos que cuesta detectarlos: ahí se mira hasta un minuto (ERC 2025).",
      "En hipotermia la desfibrilación puede no funcionar hasta que el cuerpo se recalienta: no se da a nadie por muerto hasta que esté caliente."
    ],
    escala: [],
    cambia: {
      material:{ label:"Qué material tienen para enfriarlo o abrigarlo", peso:10,
        logrado:"Dijo con qué cuentan: agua fría, hielo y sombra para enfriar, o mantas, manta térmica y un lugar resguardado para abrigar. Si no tienen, también lo dijo.",
        parcial:"Habló del material sólo cuando se lo preguntaron y sin precisar." }
    },
    checks: [
      {id:"signos_temperatura", label:"Describió la piel, la conciencia y la exposición", peso:10, critico:false,
       logrado:"Dijo si está caliente o helado, si transpira o tirita, cómo está la conciencia (confuso, raro, somnoliento) y a qué estuvo expuesto y cuánto tiempo.",
       parcial:"Dijo 'tiene calor' o 'está frío' sin la conciencia ni la exposición."},
      {id:"medidas", label:"Qué están haciendo para enfriarlo o abrigarlo", peso:10, critico:false,
       logrado:"Dijo qué hacen y con qué: lo enfrían con agua o hielo, o lo abrigan y lo resguardan, y desde cuándo.",
       parcial:"Dijo que lo atienden sin precisar qué hacen."}
    ]
  },
  lego: {
    enLinea: false,
    esenciales: [ {id:"exposicion", pide:"si estuvo al sol o haciendo ejercicio con calor, o en agua fría o a la intemperie, y cuánto tiempo"} ],
    indicaciones: [
      { si: "está caliente", di: "Llevalo a la sombra o a un lugar fresco y sacale toda la ropa que puedas." },
      { si: "está caliente", di: "Mojalo entero con agua fría y abanicalo sin parar." },
      { si: "está helado o tiritando", di: "Llevalo a un lugar resguardado, despacio, y sacale la ropa mojada." },
      { si: "está helado o tiritando", di: "Envolvelo con mantas o camperas secas, también la cabeza, y que no camine." }
    ],
    noHacer: [
      "Esperar a que se enfríe solo.",
      "Ponerle alcohol en la piel o darle alcohol para tomar.",
      "Darle de beber si está confundido o dormido.",
      "Frotarlo o masajearlo para calentarlo.",
      "Ponerle agua caliente o bolsas calientes directo sobre la piel."
    ],
    alarma: "si se pone confuso, se duerme, convulsiona o deja de tiritar sin haberse calentado",
    saber: [
      "Un golpe de calor con la persona confundida o rara es grave: enfriarlo ya es lo que más ayuda, no hay que esperar a la ambulancia.",
      "Si hay una pileta o una bañera con agua fría y se puede hacer seguro, meterlo del cuello para abajo es lo que más rápido enfría.",
      "Líquido fresco, o tibio y dulce en el frío, sólo si está despierto y traga bien.",
      "En el frío se lo mueve despacio y acostado; dejar de tiritar sin haberse calentado es mala señal."
    ],
    checks: [
      {id:"medidas_temperatura", label:"Lo enfrió o lo abrigó como le indicaron", peso:12, critico:false,
       logrado:"Hizo lo que se le indicó según el caso (sombra y agua, o resguardo y abrigo) y avisó cómo seguía.",
       parcial:"Lo hizo a medias o tarde, o hizo algo de la lista de lo que no se hace."},
      {id:"descripcion_temperatura", label:"Contó cómo está y a qué estuvo expuesto", peso:8, critico:false,
       logrado:"Dijo si está caliente o helado, si está confundido o raro, y si estuvo al sol, haciendo ejercicio o en el frío.",
       parcial:"Dijo sólo una de esas cosas, o recién después de varias preguntas."}
    ]
  }
};

/* Traumatismo: golpe, caída, choque, zambullida, fractura, golpe en la cabeza.
   guardavidas HEREDA tal cual GUIAS.trauma del index.html anterior (escala, clasificar,
   saber, extras, cambia, checks: regresión obligatoria del contrato 2.2; fuentes: Watson
   2001, ERC 2025 Primeros Auxilios y Circunstancias Especiales). Al `saber` heredado se
   le suman al final cuatro líneas para el trauma fuera del agua (ERC 2025 y AHA/Cruz
   Roja 2024: golpe en la cabeza, fractura, varias víctimas). El lego sale de las mismas
   guías de primeros auxilios (no mover, sostener la cabeza, no enderezar, no collar). */
CASOS.trauma = {
  id: "trauma",
  nombre: "Traumatismo",
  fam: "Trauma",
  provisorio: false,
  reconocer: "caída, golpe, choque o atropello, zambullida en agua baja, fractura, golpe en la cabeza, no mueve o no siente las piernas",
  rcp: null,
  fuentes: ["ERC 2025 First Aid", "ERC 2025 Special Circumstances", "AHA/ARC First Aid 2024", "Watson 2001"],
  guardavidas: {
    pide: { acciones: "qué están haciendo ya: si le sostienen la cabeza alineada, si lo movieron o lo sacaron del agua",
            material: "con qué cuentan: tabla, inmovilizadores, botiquín" },
    esenciales: [],
    extras: [],
    clasificar: [
      "Primero lo que mata rápido: si responde y si respira bien. Si respira con dificultad o no respira, eso manda y la columna pasa a segundo plano.",
      "Después, lo que te dice si es de columna: cómo se lastimó, si mueve brazos y piernas, si siente, si le duele el cuello.",
      "Y qué están haciendo: si le sostienen la cabeza alineada, si lo movieron. Si te lo contó todo junto, no lo repreguntes."
    ],
    saber: [
      "Zambullirse de cabeza en agua baja es el mecanismo típico de lesión de la columna cervical en el agua. Sin un mecanismo así, la lesión es rarísima.",
      "Si no mueve o no siente las piernas, o tiene los brazos débiles, sospechá lesión de médula: no se lo mueve más que lo indispensable y se le sostiene la cabeza alineada con el cuerpo hasta que llegue el SEM.",
      "Si no respira, la ventilación va primero aunque haya sospecha de columna: se abre la vía aérea moviendo lo mínimo, pero no se deja de ventilar por cuidar el cuello.",
      "Una lesión cervical alta puede comprometer la respiración: si empieza a respirar peor, es un cambio grave que te tienen que avisar enseguida.",
      "No tener tabla ni collar no es un problema: la estabilización con las manos alcanza hasta que llegue el SEM. No se improvisan collares.",
      "Hay que abrigarlo: el agua y la lesión medular favorecen la hipotermia.",
      // Desde acá, lo sumado para el trauma fuera del agua.
      "Fuera del agua, los mecanismos que hacen sospechar columna son la caída de altura, el choque o atropello y el golpe fuerte en la cabeza. Con eso, mismo manejo: quieto y la cabeza alineada.",
      "Golpe en la cabeza: es grave aunque ahora hable si perdió el conocimiento, está confuso o repite lo mismo, vomitó, convulsionó o toma anticoagulantes.",
      "Fractura: no se endereza ni se acomoda; un hueso expuesto se cubre con algo limpio. Si la mano o el pie de ese lado están fríos, pálidos o sin sensibilidad, es urgente.",
      "Si son varias víctimas, pedí cuántas son y la peor primero; cada una con su estado."
    ],
    escala: [],
    cambia: {},
    checks: [
      {id:"mecanismo", label:"Cómo se lastimó", peso:10, critico:false,
       logrado:"Dijo el mecanismo: se tiró de cabeza en poca profundidad, se golpeó contra el fondo o las piedras, cayó.",
       parcial:"Dijo que se golpeó sin decir cómo, o lo dijo recién cuando se lo preguntaron dos veces."},
      {id:"neurologico", label:"Si mueve y siente brazos y piernas", peso:10, critico:false,
       logrado:"Dijo qué mueve y qué no, y si siente, en términos observables.",
       parcial:"Dijo 'no se puede mover' sin precisar qué ni si siente."},
      {id:"inmovilizacion", label:"Qué están haciendo con la columna", peso:6, critico:false,
       logrado:"Dijo que le sostienen la cabeza alineada, que no lo mueven, y con qué cuentan (o que no tienen tabla ni collar).",
       parcial:"Lo mencionó a medias o sin aclarar si lo movieron."}
    ]
  },
  lego: {
    enLinea: false,
    esenciales: [ {id:"como_fue", pide:"cómo se lastimó: si se cayó de altura, lo chocaron, se tiró de cabeza o se golpeó la cabeza"} ],
    indicaciones: [
      "Que no se mueva: dejalo como está y decile que se quede quieto.",
      "Si le duele el cuello o la espalda, sostenele la cabeza con las dos manos, quieta, sin girarla.",
      "Si sangra, apretá la herida con un trapo limpio.",
      "Abrigalo con una campera o una manta, sin moverlo."
    ],
    noHacer: [
      "Sentarlo, levantarlo o hacerlo caminar.",
      "Enderezar un brazo o una pierna torcidos, o 'acomodar' un hueso.",
      "Ponerle un collar improvisado, o sacarle el casco si respira bien.",
      "Dejarlo volver a jugar, o dejarlo solo durmiendo, después de un golpe en la cabeza.",
      "Darle de comer o de tomar."
    ],
    alarma: "si se duerme, vomita, se pone confuso, le cuesta respirar o deja de responder",
    saber: [
      "Con un golpe fuerte, una caída de altura o una zambullida, puede estar lastimada la columna: lo más seguro es no moverlo.",
      "Sólo se lo mueve si hay un peligro inmediato (fuego, tránsito, agua) o si no respira y hay que reanimarlo.",
      "Después de un golpe en la cabeza, vomitar más de una vez, estar confuso o cada vez más dormido es grave.",
      "Si el brazo o la pierna están deformados, se dejan como están; si se ve el hueso, se tapa con algo limpio sin tocarlo."
    ],
    checks: [
      {id:"mecanismo", label:"Contó cómo pasó", peso:8, critico:false,
       logrado:"Dijo cómo se lastimó: de dónde se cayó, qué lo golpeó, si se tiró de cabeza.",
       parcial:"Dijo 'se lastimó' o 'se golpeó' sin contar cómo, o lo contó recién cuando se lo preguntaron dos veces."},
      {id:"no_mover", label:"No lo movió", peso:10, critico:false,
       logrado:"No lo movió (o lo movió sólo por un peligro y lo dijo) y le sostuvo la cabeza si se lo pidieron.",
       parcial:"Lo movió, lo sentó o dudó en sostenerle la cabeza, aunque después siguió la indicación."}
    ]
  }
};

/* Quemadura con la persona consciente: fuego, líquido o aceite, química, eléctrica.
   Lo clínico sale de ERC 2025 Primeros Auxilios y AHA/Cruz Roja 2024 (enfriar con agua
   corriente, sin hielo ni pomadas, cubrir con film, abrigar el resto; humo = vía aérea)
   y, para la eléctrica, AHA 2025 y ERC 2025 Circunstancias Especiales. */
CASOS.quemadura = {
  id: "quemadura",
  nombre: "Quemadura",
  fam: "Trauma",
  provisorio: false,
  reconocer: "se quemó con fuego, agua o aceite caliente, un químico o la corriente, y está consciente",
  rcp: null,
  fuentes: ["ERC 2025 First Aid", "AHA/ARC First Aid 2024", "ERC 2025 Special Circumstances", "AHA 2025 Special Circumstances"],
  guardavidas: {
    pide: { acciones: "si ya están enfriando la quemadura con agua corriente y desde hace cuánto",
            material: "si tienen agua corriente cerca, botiquín, film o apósitos y una manta" },
    esenciales: [ {id:"quemadura_zona", pide:"con qué se quemó, qué parte del cuerpo y qué tamaño, y si respiró humo"} ],
    extras: [],
    clasificar: [
      "Qué la causó (fuego, líquido, químico, electricidad) y si fue en un lugar cerrado con humo.",
      "Dónde y cuánto: cara, cuello, manos, genitales o articulaciones pesan más; una superficie grande (un brazo entero, el tronco) es grave, y más en un chico.",
      "Voz ronca, tos, hollín en la nariz o la boca, o falta de aire: la vía aérea está comprometida y eso manda sobre todo lo demás.",
      "Si ya te dijo que la enfría y desde cuándo, no lo repreguntes."
    ],
    saber: [
      "Lo que más cambia el resultado es enfriar cuanto antes con agua corriente fresca, no helada, unos 20 minutos.",
      "Nada de hielo, pomadas, pasta dental, manteca ni aceite. Las ampollas no se rompen y la ropa pegada no se despega; anillos, relojes y ropa suelta se sacan antes de que se hinche.",
      "Después de enfriar se cubre con film transparente o un paño limpio que no deje pelusa, sin apretar.",
      "Un gran quemado, y sobre todo un chico, se enfría rápido: se enfría sólo la quemadura y se abriga el resto. Si tirita, se corta el agua.",
      "Química: se saca la ropa con el producto y se lava con mucha agua; si es un polvo seco, se cepilla antes. En los ojos, agua sin parar por lo menos 15 minutos.",
      "Eléctrica: primero que se corte la corriente. La piel puede mostrar poco y haber lesión por dentro o una arritmia: siempre la tiene que ver un médico.",
      "Humo en un lugar cerrado: pensá también en monóxido; que salga al aire libre."
    ],
    escala: [],
    cambia: {
      material:{ label:"Qué material tienen para enfriar y cubrir", peso:10,
        logrado:"Dijo con qué cuentan: agua corriente cerca, film o apósitos, botiquín, manta. Si no tienen agua cerca, también lo dijo.",
        parcial:"Habló del material sólo cuando se lo preguntaron y sin precisar." }
    },
    checks: [
      {id:"extension", label:"Qué la causó, dónde y qué tamaño", peso:10, critico:false,
       logrado:"Dijo el agente (fuego, líquido, químico, eléctrica), la zona, una superficie aproximada, y si compromete cara o vía aérea o si respiró humo.",
       parcial:"Dijo 'se quemó' con uno solo de esos datos, o sin aclarar si hubo humo o compromiso de la cara."},
      {id:"enfriamiento", label:"Si la están enfriando y cómo", peso:10, critico:false,
       logrado:"Dijo que la enfrían con agua corriente y desde hace cuánto, o por qué no pueden.",
       parcial:"Dijo que la atienden sin precisar cómo, o mencionó el agua sin el tiempo."}
    ]
  },
  lego: {
    enLinea: false,
    esenciales: [ {id:"quemadura_zona", pide:"con qué se quemó, en qué parte del cuerpo y qué tan grande es"} ],
    indicaciones: [
      { si: "fue con la corriente y sigue tocando el cable o el aparato", di: "No lo toques: primero que alguien corte la luz en la llave general." },
      "Poné la quemadura bajo el agua fresca de la canilla, no helada, y dejala ahí unos veinte minutos.",
      "Mientras corre el agua, sacale anillos, pulseras, reloj y la ropa que no esté pegada.",
      "Después tapala con film de cocina o un trapo limpio, sin apretar, y abrigale el resto del cuerpo."
    ],
    noHacer: [
      "Poner hielo o agua helada.",
      "Poner pasta dental, manteca, aceite, cremas o yerbas.",
      "Romper las ampollas.",
      "Despegar la ropa pegada a la piel."
    ],
    alarma: "si se le pone ronca la voz, tose, le falta el aire, tirita o se adormece",
    saber: [
      "Lo que más ayuda es el agua corriente fresca enseguida y durante un buen rato; frena el daño aunque ya no duela tanto.",
      "Si fue con un químico, se saca la ropa con el producto y se lava con mucha agua; en los ojos, agua sin parar unos quince minutos.",
      "Si respiró humo, tiene la cara quemada o la voz ronca, es más grave de lo que parece.",
      "Un chico con una quemadura grande se enfría rápido: si tirita, se corta el agua y se lo abriga."
    ],
    checks: [
      {id:"enfriamiento", label:"Enfrió la quemadura como le indicaron", peso:12, critico:false,
       logrado:"Puso la quemadura bajo agua corriente cuando se lo indicaron y la dejó el tiempo pedido, sin hielo ni pomadas.",
       parcial:"La enfrió poco rato, usó hielo o algo casero, o tardó en hacerlo."},
      {id:"descripcion_quemadura", label:"Contó con qué se quemó y dónde", peso:8, critico:false,
       logrado:"Dijo con qué se quemó, qué parte del cuerpo y qué tan grande, y si respiró humo.",
       parcial:"Dijo 'se quemó' sin decir con qué o dónde, o lo dijo recién después de varias preguntas."}
    ]
  }
};

/* Inconsciente que respira (provisorio: cualquier causa que aparezca lo reemplaza). Fuentes:
   ERC 2025 First Aid y AHA/ARC First Aid 2024 (posición lateral, nada por boca, vigilar la
   respiración), ERC 2025 BLS (si deja de respirar normal, es paro). Sus indicaciones lego son
   las comunes a todo inconsciente: la app las antepone en cualquier caso con S.inconsciente. */
CASOS.inconsciente = {
  id: "inconsciente",
  nombre: "Inconsciente que respira",
  fam: "Neurológico",
  provisorio: true,
  reconocer: "no responde pero respira normalmente, y todavía no se sabe por qué",
  rcp: null,
  fuentes: ["ERC 2025 First Aid", "AHA/ARC First Aid 2024", "ERC 2025 BLS"],
  guardavidas: {
    pide: { acciones: "si ya lo pusieron de costado y si alguien vigila que siga respirando",
            material: "si hay un DEA cerca, por si deja de respirar" },
    esenciales: [ {id:"antes", pide:"qué pasó justo antes de que dejara de responder, y hace cuánto está así"} ],
    extras: [],
    clasificar: [
      "Lo primero es confirmar que respira NORMALMENTE: si ronca, boquea o respira raro, es paro, no un inconsciente.",
      "Después preguntá abierto qué pasó antes de que quedara así. Si no lo sabe, recién ahí preguntá si se golpeó o si tiene alguna enfermedad conocida.",
      "Y qué están haciendo: si ya está de costado y alguien lo vigila. Si te lo contó todo junto, no lo repreguntes."
    ],
    saber: [
      "El riesgo de un inconsciente que respira es que se le tape la vía aérea con la lengua o con un vómito: de costado se protege, y alguien tiene que mirar que siga respirando.",
      "Si hubo un golpe o una caída de altura, no se lo rota de rutina: se le sostiene la cabeza alineada, y sólo se lo pone de costado si vomita o le cuesta respirar.",
      "Puede pasar a paro en cualquier momento: si deja de respirar normal o boquea, es RCP ya.",
      "Las causas que cambian el despacho son un golpe en la cabeza, una convulsión, el azúcar baja en un diabético, alcohol, drogas o pastillas. Si aparece una, el caso se reclasifica.",
      "Nada por boca: ni agua, ni azúcar, ni pastillas, aunque sea diabético."
    ],
    escala: [],
    cambia: {
      material:{ label:"Qué material tienen, por si deja de respirar",
        logrado:"Dijo si hay un DEA cerca y quién lo trae, o que no hay, y con qué cuentan para ventilar si hiciera falta.",
        parcial:"Habló del material sólo cuando se lo preguntaron y sin precisar."}
    },
    checks: [
      {id:"via_aerea", label:"Cómo respira, en qué posición y quién lo vigila", peso:10, critico:false,
       logrado:"Confirmó que respira normalmente (sin ronquido ni boqueo), dijo que está de costado (o por qué no, si hubo golpe) y que alguien vigila la respiración.",
       parcial:"Dijo 'respira' sin aclarar cómo, o no dijo en qué posición está ni si alguien lo vigila."},
      {id:"antecedente", label:"Qué pasó antes y desde cuándo", peso:8, critico:false,
       logrado:"Contó qué pasó antes de que dejara de responder y hace cuánto, o dijo claramente que no lo sabe.",
       parcial:"Lo dijo vago, o recién cuando se lo preguntaron más de una vez."}
    ]
  },
  lego: {
    enLinea: true,
    esenciales: [],
    indicaciones: [
      { si: "no se golpeó ni se cayó de altura", di: "Ponelo de costado, con la boca mirando al piso y la pierna de arriba doblada para que no se dé vuelta." },
      { si: "se golpeó o se cayó de altura", di: "No lo muevas. Sostenele la cabeza quieta con las dos manos, alineada con el cuerpo." },
      "Mirá que siga respirando normal todo el tiempo, y avisame si cambia.",
      "No le des nada por la boca: ni agua, ni azúcar, ni remedios.",
      { si: "vomita", di: "Ponelo de costado enseguida, moviéndole la cabeza y el cuerpo juntos, y limpiale la boca con los dedos." }
    ],
    noHacer: [
      "Sentarlo o pararlo.",
      "Echarle agua en la cara o darle algo para oler.",
      "Ponerle algo en la boca para que no se trague la lengua.",
      "Dejarlo solo."
    ],
    alarma: "si deja de respirar normal",
    saber: [
      "Si no responde pero respira normal, el riesgo es que se le tape la garganta con la lengua o con un vómito: de costado se protege.",
      "Puede dejar de respirar en cualquier momento: si boquea, ronca o respira raro, es paro y se empieza la RCP guiada.",
      "Aunque se haya golpeado, manda la respiración: si vomita o le cuesta respirar, se lo pone de costado moviendo cabeza y cuerpo juntos.",
      "A alguien que no responde no se le corta: te quedás en línea hasta que llega la ambulancia."
    ],
    checks: [
      {id:"pls", label:"Lo puso de costado y avisó cómo respiraba", peso:10, critico:false,
       logrado:"Lo puso de costado cuando se lo indicaron (o explicó que no lo movía por un golpe) y avisó si seguía respirando normal.",
       parcial:"Tardó, lo dejó boca arriba sin motivo, o no avisó cómo respiraba."},
      {id:"antes", label:"Contó qué pasó antes", peso:6, critico:false,
       logrado:"Contó qué pasó antes de que dejara de responder y desde cuándo está así, o dijo que no lo sabía.",
       parcial:"Lo contó vago o recién después de varias preguntas."}
    ]
  }
};

/* Desmayo que ya se recuperó (síncope; provisorio). Fuentes: AHA/ARC First Aid 2024
   (presíncope) y ERC 2025 First Aid; las señales de alarma cardíaca (esfuerzo, nadando,
   dolor de pecho o palpitaciones antes) salen de relevo/profesional.md. */
CASOS.desmayo = {
  id: "desmayo",
  nombre: "Desmayo",
  fam: "Neurológico",
  provisorio: true,
  reconocer: "se desmayó y ya volvió en sí: responde, habla, se está recuperando",
  rcp: null,
  fuentes: ["AHA/ARC First Aid 2024", "ERC 2025 First Aid"],
  guardavidas: {
    pide: { acciones: "si lo tienen acostado y si alguien se quedó con él",
            material: "si hay un DEA cerca, sobre todo si se desmayó haciendo esfuerzo o nadando" },
    esenciales: [ {id:"recupero", pide:"si ya se despertó del todo y habla normal, y cuánto duró el desmayo"} ],
    extras: [],
    clasificar: [
      "Primero confirmá que ya responde y respira normal. Si no se despertó, no es un desmayo: es un inconsciente o un paro.",
      "Después lo que separa un desmayo común de uno grave: qué estaba haciendo (esfuerzo, nadando), si antes tuvo dolor de pecho o palpitaciones, si se golpeó la cabeza al caer, y la edad.",
      "Si te lo dio todo junto, no lo repreguntes."
    ],
    saber: [
      "Un desmayo breve que se recupera solo, en un joven, estando parado o con calor, suele ser benigno; igual se despacha.",
      "Son señales de causa cardíaca: que haya sido durante un esfuerzo o nadando, sin aviso previo, con dolor de pecho o palpitaciones antes, o en alguien mayor o con problemas del corazón.",
      "Si se golpeó la cabeza al caer, importa si vomitó, si está confundido y si toma anticoagulantes.",
      "Acostado boca arriba (decúbito dorsal) mientras se recupera, y que no se levante de golpe: puede volver a caerse. No se le indica levantar las piernas (corrección del instructor).",
      "Si vuelve a perder el conocimiento, se reevalúa: si no responde y no respira normal, es paro."
    ],
    escala: [],
    cambia: {
      material:{ label:"Qué material tienen en el lugar",
        logrado:"Dijo con qué cuenta: si hay un DEA cerca (lo que más importa si fue en un esfuerzo), botiquín, algo para abrigarlo, o que no tiene nada.",
        parcial:"Habló del material sólo cuando se lo preguntaron y sin precisar."}
    },
    checks: [
      {id:"evolucion", label:"Cuánto duró y cómo está ahora", peso:10, critico:false,
       logrado:"Dijo cuánto duró el desmayo, cómo está ahora (si habla y está orientado) y si se golpeó al caer.",
       parcial:"Dijo 'ya está bien' sin decir cuánto duró ni si se golpeó."},
      {id:"circunstancias", label:"Qué estaba haciendo y qué sintió antes", peso:8, critico:false,
       logrado:"Dijo qué estaba haciendo cuando se desmayó (esfuerzo, nadando, parado al sol) y si antes tuvo dolor de pecho, palpitaciones o mareo.",
       parcial:"Lo contó a medias, o recién cuando se lo preguntaron dos veces."}
    ]
  },
  lego: {
    enLinea: false,
    esenciales: [],
    indicaciones: [
      "Que se quede acostado boca arriba, tranquilo, y que no se levante todavía.",
      "No le des nada de tomar hasta que esté bien despierto.",
      "Quedate con él y mirá que siga despierto y respirando normal."
    ],
    noHacer: [
      "Levantarlo de golpe o hacerlo caminar.",
      "Echarle agua en la cara o darle alcohol para oler.",
      "Darle de tomar mientras está mareado."
    ],
    alarma: "si vuelve a desmayarse, le duele el pecho, le cuesta respirar o lo ves confundido",
    saber: [
      "Si ya se despertó y habla normal, lo importante es que se quede acostado y no se vuelva a caer.",
      "Si no se despierta enseguida, no es un desmayo: tratalo como a alguien que no responde.",
      "Es de alarma si se desmayó haciendo esfuerzo o nadando, o si antes le dolió el pecho o sintió el corazón acelerado: preguntáselo.",
      "Si se golpeó la cabeza al caer, que no se mueva y que te avise si vomita o se pone confuso."
    ],
    checks: [
      {id:"que_paso", label:"Contó cómo se cayó y cómo está ahora", peso:8, critico:false,
       logrado:"Contó qué estaba haciendo cuando se desmayó, si se golpeó, y cómo está ahora (si habla, si está despierto).",
       parcial:"Dijo 'ya está bien' sin contar qué pasó ni cómo está."}
    ]
  }
};

/* Otra urgencia (provisorio: la guía genérica, sólo con el Bloque 1). No tiene contenido
   clínico propio: lo que dice sale de las reglas comunes de relevo/lego-preaviso.md y de la
   estructura de despacho de relevo/profesional.md (AHA 2025 Systems of Care). */
CASOS.otro = {
  id: "otro",
  nombre: "Otra urgencia",
  fam: "Otro",
  provisorio: true,
  reconocer: "cualquier otra urgencia que no encaja arriba: dolor fuerte, herida chica, fiebre, crisis de nervios, un pedido poco claro",
  rcp: null,
  fuentes: ["AHA 2025 Systems of Care"],
  guardavidas: {
    pide: {},
    esenciales: [],
    extras: [],
    clasificar: [
      "Preguntá abierto qué le pasa y desde cuándo, y después lo que te dice si es grave: si responde, si respira normal, si le duele mucho, si sangra.",
      "No le pongas nombre vos al cuadro: si lo que cuenta encaja en otro tipo de llamada, se reclasifica solo."
    ],
    saber: [
      "Lo que decide la urgencia no es la etiqueta sino el estado: si responde, si respira normalmente, si tiene mucho dolor, si empeora.",
      "Si no sabés qué pasa, lo esencial alcanza para despachar: dónde, qué pasó, cuántos, si responde y si respira.",
      "Si en algún momento te dice que no responde y no respira normal, es paro."
    ],
    escala: [],
    cambia: {
      material:{ label:"Qué material tienen en el lugar",
        logrado:"Dijo con qué cuenta que sirva para este caso (botiquín, DEA, algo para abrigar) o que no tiene nada.",
        parcial:"Habló del material sólo cuando se lo preguntaron y sin precisar."}
    },
    checks: []
  },
  lego: {
    enLinea: false,
    esenciales: [],
    indicaciones: [
      "Que se quede quieto, en la posición en que esté más cómodo.",
      "Quedate con él y avisame si empeora."
    ],
    noHacer: [
      "Darle remedios por tu cuenta.",
      "Llevarlo en auto sin avisar, si ya pediste la ambulancia."
    ],
    alarma: "si empeora, deja de responder o le cuesta respirar",
    saber: [
      "Si no sabés qué pasa, alcanza con lo esencial para mandar la ambulancia: no hace falta adivinar el diagnóstico.",
      "Si deja de responder o de respirar normal, todo cambia: es RCP guiada."
    ],
    checks: []
  }
};

/* =====================================================================================
   Detección: qué tipo de llamada es, si hay un paro y quién es la víctima

   Todo esto lee SÓLO lo que dijo el alumno, nunca lo que dijo el operador: si se
   clasificara con el texto del operador, él mismo induciría su caso y dejaría de ser
   ciego a la escena.

   Regla general, la misma del despacho y de la ubicación: ninguna transición se ata sólo
   a que el modelo coopere con una marca, si el mismo hecho se puede leer de lo que dijo
   el alumno. Y al revés: no adivina. Si no hay una señal clara, devuelve null.

   Cosas de la transcripción por voz que condicionan cómo está escrito:
   - No llegan los signos de pregunta ni, casi nunca, las comas. Cuando llegan se usan
     (cortan la frase), pero nada depende de ellos.
   - Todo se compara sin tildes y por raíz ("convuls", "ahog").
   - Una negación PEGADA anula la señal ("no sangra", "no se ahogó", "no es asmático");
     una más atrás no ("no respira, sangra mucho").
   ===================================================================================== */
const DETECTOR = (function(){

  /* Deja el texto en minúsculas, sin tildes ni signos, con espacios simples y un espacio
     en cada punta (así " no respira " se busca como palabras enteras). La eñe queda como
     ene: "años" es "anos". Con `cortes`, la puntuación queda como " | ", para que una
     señal no se arme con palabras de dos frases distintas ("no, respira bien" no es "no
     respira"), y el "sí" con tilde también corta, para no confundirlo con el "si" de
     "¿y si se ahoga?". */
  function limpiar(txt, cortes){
    let t = String(txt == null ? "" : txt).toLowerCase();
    if(cortes) t = t.replace(/(^|[^a-z0-9áéíóúüñ])sí(?![a-z0-9áéíóúüñ])/g, "$1 | ");
    t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if(cortes) t = t.replace(/[.,;:!?¿¡()\n\r]+/g, " | ").replace(/[^a-z0-9| ]+/g, " ");
    else t = t.replace(/[^a-z0-9 ]+/g, " ");
    t = t.replace(/\s+/g, " ").trim();
    if(cortes) t = (" " + t + " ").replace(/ q /g, " que ").trim();
    return t ? " " + t + " " : " ";
  }

  // Los turnos del alumno, ya limpios. Acepta un string suelto y descarta los silencios.
  function turnos(textos){
    const lista = Array.isArray(textos) ? textos : (textos == null ? [] : [textos]);
    return lista.filter(x => x != null && !String(x).startsWith("[silencio"))
                .map(x => limpiar(x, true)).filter(t => t.trim());
  }

  /* Lo que, pegado adelante, da vuelta la señal. NEGADO admite hasta tres palabritas en
     el medio ("no se le está hinchando", "no es un bebé"). CONDICION es la pregunta o el
     supuesto, que por voz llega sin signos ("y si entra en paro").
     CESO es "dejó de", "paró de", y sólo se usa para la RCP en curso ("dejamos de hacer
     RCP"): para el tipo de caso NO anula, porque "ya paró de convulsionar" sigue siendo
     una llamada por una convulsión, y "dejó de tiritar" es una hipotermia que empeora. */
  const NEGADO = / (?:no|ni|nunca|jamas|nadie|tampoco|sin)(?: (?:se|le|lo|la|les|los|las|me|te|nos|esta|estaba|estan|es|era|fue|tiene|tenia|tuvo|hay|hubo|ha|han|muy|tan|un|una|ningun|ninguna|creo que|parece que)){0,3} $/;
  const CESO = / (?:dejo|deje|dejamos|dejaron|paro|pare|paramos|pararon|termino|termine|terminamos|terminaron) de(?: [a-z]+){0,2} $/;
  const CONDICION = / (?:y si|por si|que pasa si|que hago si|como si|en caso de que)(?: (?:se|le|lo|la|esta|es|fuera|estuviera|entra|entrara|hace|tiene|empieza|deja|vuelve|da)){0,2} $/;

  function anulada(antes){
    return NEGADO.test(antes) || CONDICION.test(antes);
  }

  /* ¿Aparece `re` AFIRMADA en el texto? Las expresiones empiezan con un espacio (palabra
     entera) y son globales. `sinFiltro` es para las que ya traen su propio "no" ("no
     respira"): por voz "no, no respira" llega "no no respira", y el primer "no" no la
     niega. `acepta(m, antes, t)` deja descartar una coincidencia por lo que la rodea. */
  function afirma(t, re, sinFiltro, acepta){
    re.lastIndex = 0;
    let m;
    while((m = re.exec(t))){
      re.lastIndex = m.index + 1;
      const antes = t.slice(0, m.index + 1);
      if(!sinFiltro && anulada(antes)) continue;
      if(acepta && !acepta(m, antes, t)) continue;
      return true;
    }
    return false;
  }

  /* ---------- paro ---------- */
  // "no respira bien" no es "no respira". "No respira normal" sí cuenta: es la respuesta
  // literal a "¿respira normalmente?".
  // "Ni respira" ("no responde ni respira") también: por voz es como más se dice. "No
  // respira por la nariz" es alguien que respira por la boca.
  const NO_RESPIRA = / (?:no respira|ni respira|no esta respirando|ni esta respirando|no estaria respirando|dejo de respirar|sin respirar|no le siento la respiracion)(?! (?:muy |tan |del todo |nada )?bien | mal | por la nariz )(?= )/g;
  /* "No contesta" a secas NO va acá: también es un teléfono ("llamé a la madre y no
     contesta"), y juntado con un "no respira" de otro turno armaba un paro. Vale sólo en
     el mismo turno que el "no respira" (NO_CONTESTA, en paro()), o diciendo a quién no le
     contesta ("no me contesta"). */
  const NO_RESPONDE = / (?:no responde|ni responde|no reacciona|ni reacciona|dejo de responder|dejo de reaccionar|no (?:me|nos|le|te) contesta|no se despierta|no despierta|no (?:lo|la) (?:puedo|podemos|pudimos|pude) despertar|no hay forma de despertarl[oa]|no vuelve en si)(?= )/g;
  const NO_CONTESTA = / (?:no contesta|ni contesta)(?= )/g;
  /* Respiración anormal: ronca, respira raro, de a ratos, o no se sabe si respira. Con
     alguien que NO responde es la definición de paro de las guías (AHA 2025, ERC 2025): la
     respiración agónica dicha con palabras de un lego es la causa número uno de RCP
     guiada que no arranca. Con alguien consciente no dice nada, por eso va siempre junto
     con noResponde(). Pasa por el filtro de negación: "no respira mal" es que respira. */
  const RESPIRA_ANORMAL = / (?:ronca|roncando|ronquidos?|respira raro|respira feo|respira mal|respira (?:muy )?poquito|respira de a ratos|respira a ratos|hace ruidos|gorgote[a-z]*|suspira|no se si respira|no sabe si respira|no sabemos si respira|respira pero no normal|no respira (?:muy |tan |del todo )?bien|no respira normal)(?= )/g;
  const INCONSCIENTE = / (?:inconsciente|desmayad[oa]|desvanecid[oa]|sin conocimiento|perdio el conocimiento|sin conciencia)(?= )/g;
  const BOQUEA = / (?:boque[a-z]*|gasping|respiracion agonica)(?= )/g;
  // "Sin pulso radial" es un grado 4 de ahogamiento, no un paro.
  const SIN_PULSO = / (?:no tiene pulso|no le (?:siento|encuentro|encontramos|sentimos) (?:el )?pulso|esta sin pulso)(?! radial)(?= )/g;
  /* "paro" suelto NUNCA: sin tildes, "ya paró de convulsionar", "paró de sangrar" y "se
     paró y se cayó" quedan escritos igual. Sólo con algo que lo vuelva sustantivo. "El
     paro" tampoco: sin tildes, "él paró de temblar" queda "el paro de temblar". */
  const DICE_PARO = / (?:(?:un|en) paro(?! respiratorio)|paro cardi[a-z]*|parada cardiaca|pcr)(?= )/g;
  /* "Paro respiratorio" es el grado 5 de Szpilman: no respira pero TIENE pulso, y puede
     pasar a grado 6. La guía del ahogamiento le enseña al guardavidas a reportarlo así.
     Vale como paro sólo si en la llamada nadie dijo que tiene pulso (un lego que dice
     "paro respiratorio" no le tomó el pulso, y para él no respirar ya es paro). */
  const PARO_RESPIRATORIO = / paro respiratorio(?= )/g;
  const CON_PULSO = / (?:tiene pulso|con pulso|hay pulso|le (?:siento|encuentro|encontramos|sentimos) (?:el )?pulso|pulso carotideo|grado (?:5|cinco))(?= )/g;
  /* RCP en curso, con palabra inequívoca y AFIRMADA, como empezoRCP(): un verbo que la
     afirma, hasta cuatro palabras, y la palabra. "Apretando", "empujando" y "compresiones"
     solas NO: son también la presión sobre una herida y las compresiones abdominales del
     atragantamiento. */
  const RCP_AFIRMADA = / (?:estoy|estamos|esta|estan|sigo|seguimos|siguen|empece|empezamos|empezaron|arranque|arrancamos|arrancaron|inicie|iniciamos|iniciaron|inicio|iniciando|comence|comenzamos|comenzaron|llevo|llevamos|llevan|continuo|continuamos|hice|hicimos|hicieron|haciendo|haciendole|dando|dandole|realizando|practicando|aplicando)((?: [a-z0-9]+){0,4}?) (?:rcp|erre ce pe|reanimacion|resucitacion|masajes? cardiacos?|compresiones (?:en el pecho|toracicas|cardiacas))(?= )/g;
  const REANIMANDO = / (?:reanimando|resucitando)(?:lo|la|le)?(?= )/g;
  const DUDA_RCP = / (?:como|donde|cuando|cuanto|que|quien|alguien|tengo que|hay que|debo|puedo|se|sabe|sabes|saben)(?: se| le| lo)? $/;
  const NIEGA_EN_EL_MEDIO = / (?:no|nunca|nadie|sin|como|saber)(?= |$)/;
  // "No le estoy haciendo rcp": el "no" queda a dos o tres palabras de la palabra que
  // dispara ("haciendo"), así que acá la negación se busca un poco más atrás.
  const NIEGA_LA_RCP = / (?:no|nunca|nadie|ni|tampoco|sin)(?: [a-z]+){0,3} $/;

  /* "Hice un curso de RCP", "estamos en una clase de RCP", "estoy dando una clase de RCP
     y a un alumno le duele el pecho": el simulador se usa justamente en cursos de RCP, y
     esto se leía como RCP en curso, con un paro que después no se apaga. Lo que hay entre
     el verbo y la palabra (m[1]) no puede ser un curso, y lo que sigue no puede ponerla
     en el pasado ("RCP el año pasado", "hace dos años"). */
  const CURSO_RCP = / (?:curso|cursos|clase|clases|capacitacion|capacitaciones|taller|talleres|entrenamiento|practica|practicas|examen|instructor|instructora|certificado|carnet)(?= |$)/;
  const RCP_EN_PASADO = /^ (?:el ano pasado|hace (?:un|una|unos|unas|dos|tres|cuatro|cinco|varios|varias|mucho|poco|[0-9]+)|en (?:el|la) (?:club|escuela|colegio|trabajo|facultad|cruz roja))(?= )/;
  function rcpEnCurso(t){
    if(afirma(t, REANIMANDO, false, (m, antes) => !CESO.test(antes) && !CURSO_RCP.test(antes.slice(-40)))) return true;
    return afirma(t, RCP_AFIRMADA, false, (m, antes, todo) =>
      !DUDA_RCP.test(antes) && !CESO.test(antes) && !NIEGA_LA_RCP.test(antes) && !NIEGA_EN_EL_MEDIO.test(m[1] || "")
      && !CURSO_RCP.test(m[1] || "") && !RCP_EN_PASADO.test(todo.slice(m.index + m[0].length)));
  }
  function noResponde(T){
    return T.some(t => afirma(t, NO_RESPONDE, true) || afirma(t, INCONSCIENTE));
  }
  /* "Se desmayó y no respira", "cayó redondo, no respira": el desplome vale como "no
     responde" sólo si viene en el MISMO turno que el "no respira". Entre turnos no,
     porque el que se desmayó hace un rato puede estar hablando ahora. */
  const SE_DESPLOMO = / (?:se desmayo|se desplomo|se desvanecio|cayo redond[oa]|cayo desplomad[oa]|cayo sec[oa])(?= )/g;
  function paro(textos){
    const T = turnos(textos);
    if(T.some(t => afirma(t, BOQUEA) || afirma(t, SIN_PULSO, true) || afirma(t, DICE_PARO) || rcpEnCurso(t))) return true;
    if(T.some(t => afirma(t, PARO_RESPIRATORIO)) && !T.some(t => afirma(t, CON_PULSO))) return true;
    if(T.some(t => afirma(t, NO_RESPIRA, true) && (afirma(t, SE_DESPLOMO) || afirma(t, NO_CONTESTA, true)))) return true;
    // No responde y respira de forma anormal (ronca, de a ratos, no sabe si respira).
    if(T.some(t => afirma(t, RESPIRA_ANORMAL)) && noResponde(T)) return true;
    // El atragantado que pierde el conocimiento es un paro: al piso y RCP, sin evaluar la
    // respiración (ERC 2025 BLS, AHA 2025). Lo dice el propio caso: "si deja de
    // responder, es un paro".
    if(atragantadoQuePerdioElConocimiento(T)) return true;
    // Las dos mitades pueden venir en turnos distintos: "no responde" y, tres turnos
    // después, "no, no respira".
    return T.some(t => afirma(t, NO_RESPIRA, true)) && noResponde(T);
  }

  /* Lo mínimo para creerle al modelo una marca de paro: alguna señal suelta. Salvo que lo
     ÚLTIMO que el alumno dijo sobre la respiración sea que respira bien: "se desmayó, no
     responde pero respira bien" no es indicio, y con indicio una marca equivocada del
     modelo prendía el paro (que no se apaga) en alguien que respira. */
  const COLOR = / (?:morad[oa]s?|azul(?:es|ad[oa]s?)?|cianosis|cianotic[oa]|violeta|muert[oa]|se murio|fallecio)(?= )/g;
  const RESPIRA_BIEN = / (?:respira|esta respirando|sigue respirando)(?= (?:bien |normal |normalmente |tranquil[oa] |sin problemas? )?(?:\| |$))/g;
  // El turno donde dijo por última vez algo de la respiración, si ahí dijo que respira
  // bien; si no, -1.
  function turnoRespiraBien(T){
    let i = T.length - 1;
    while(i >= 0 && !T[i].includes(" respir")) i--;
    if(i < 0) return -1;
    const t = T[i];
    return (afirma(t, RESPIRA_BIEN) && !afirma(t, NO_RESPIRA, true) && !afirma(t, RESPIRA_ANORMAL)) ? i : -1;
  }
  function indicio(textos){
    const T = turnos(textos);
    if(paro(textos)) return true;
    const bien = turnoRespiraBien(T);
    // Que respira bien anula el "no responde" (es un inconsciente que respira), pero no
    // un "está morado" o "no tiene pulso" que el alumno dijo DESPUÉS.
    if(bien >= 0) return T.some((t, i) => i > bien && (afirma(t, SIN_PULSO, true) || afirma(t, BOQUEA) || afirma(t, COLOR)));
    return T.some(t => afirma(t, NO_RESPIRA, true) || afirma(t, NO_RESPONDE, true) || afirma(t, NO_CONTESTA, true) || afirma(t, INCONSCIENTE)
                || afirma(t, SIN_PULSO, true) || afirma(t, BOQUEA) || afirma(t, COLOR));
  }

  /* ---------- inconsciente ---------- */
  // El ESTADO, no el episodio: "se desmayó" puede ser alguien que ya está hablando, y la
  // app no apaga S.inconsciente. Por eso acá va "desmayado" y no "se desmayó".
  const NO_DESPIERTA = / (?:no responde|ni responde|no reacciona|ni reacciona|dejo de responder|dejo de reaccionar|no (?:me|nos|le|te) contesta|no se despierta|no despierta|no (?:lo|la) (?:puedo|podemos|pudimos|pude) despertar|no hay forma de despertarl[oa])(?= )/g;
  const ESTA_INCONSCIENTE = / (?:inconsciente|desmayad[oa])(?= )/g;
  // "Ahora sí responde" llega como "ahora | responde": el "sí" con tilde corta (limpiar).
  const VOLVIO = / (?:ya volvio|volvio en si|ya habla|ya esta hablando|ya se desperto|se desperto|ya desperto|ya reacciono|ya reacciona|ya responde|ya contesta|ya esta consciente|ya abrio los ojos|abrio los ojos|ahora (?:\| )?(?:responde|contesta|habla|reacciona)|(?:ya )?me (?:habla|contesta|responde)|esta despiert[oa]|recupero (?:el conocimiento|la conciencia)|ya se recupero)(?= )/g;
  function ultima(t, re, sinFiltro){
    let pos = -1, m;
    re.lastIndex = 0;
    while((m = re.exec(t))){
      re.lastIndex = m.index + 1;
      if(!sinFiltro && anulada(t.slice(0, m.index + 1))) continue;
      pos = m.index;
    }
    return pos;
  }
  function inconsciente(textos){
    const T = turnos(textos);
    let donde = null;      // [turno, posición] de la última vez que lo dijo
    T.forEach((t, i) => {
      const p = Math.max(ultima(t, NO_DESPIERTA, true), ultima(t, ESTA_INCONSCIENTE));
      if(p >= 0) donde = [i, p];
    });
    if(!donde) return false;
    // Si DESPUÉS dijo que volvió en sí, ya no está inconsciente.
    for(let i = donde[0]; i < T.length; i++){
      const p = ultima(T[i], VOLVIO);
      if(p >= 0 && (i > donde[0] || p > donde[1])) return false;
    }
    return true;
  }

  /* ---------- víctima ---------- */
  const NUMERO = {cero:0, un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8,
    nueve:9, diez:10, once:11, doce:12, trece:13, catorce:14, quince:15, dieciseis:16, diecisiete:17,
    dieciocho:18, diecinueve:19, veinte:20, veintiun:21, veintiuno:21, veintidos:22, veintitres:23,
    veinticuatro:24, veinticinco:25, veintiseis:26, veintisiete:27, veintiocho:28, veintinueve:29,
    treinta:30, cuarenta:40, cincuenta:50, sesenta:60, setenta:70, ochenta:80, noventa:90, cien:100};
  function aNumero(palabra, unidad){
    if(/^\d+$/.test(palabra)) return Number(palabra);
    if(!Object.prototype.hasOwnProperty.call(NUMERO, palabra)) return null;
    const n = NUMERO[palabra];
    if(unidad && n >= 30 && n < 100 && Object.prototype.hasOwnProperty.call(NUMERO, unidad) && NUMERO[unidad] < 10) return n + NUMERO[unidad];
    return n;
  }
  // "45 años", "ocho meses", "cuarenta y cinco años", "un añito".
  const EDAD = / ([a-z0-9]+)(?: y ([a-z]+))? (anos?|anitos?|meses|mes)(?= )/g;
  // "Hace tres años que es diabético", "tengo 30 años" (el que llama), "embarazada de 8 meses".
  const NO_ES_EDAD = / (?:hace|desde hace|hace como|hace unos|tengo|embarazada de|embarazo de|cada)(?: (?:mas|menos|casi|unos|como|de)){0,2} $/;
  const BEBE = / (?:(?:el|la|mi|un|una|al|del|este|esta|ese|esa|su|nuestro|nuestra|es|como) beb[ea]s?|bebit[oa]s?|recien nacid[oa]s?|lactantes?|menos de un ano)(?= )/g;
  const NENE = / (?:nen[ea]s?|nenit[oa]s?|chiquit[oa]s?|chiquitin|hijit[oa]s?|criaturas?|(?:un|una|el|la|mi|al|del|este|esta|ese|esa) nin[oa]|(?:un|una|el|la|mi|al|del|este|esta|ese|esa) chic[oa])(?= )/g;
  // "Señor", "señora", "hombre" o "mujer" SUELTOS no cuentan: son el vocativo al operador
  // ("sí, señora") o quien llama. Hace falta el artículo o el "mi".
  const ADULTO = / (?:(?:un|una) (?:senor|senora|hombre|mujer|ancian[oa]|adult[oa]|abuel[oa]|persona mayor|persona adulta|adolescente|jubilad[oa])|mi (?:marido|esposo|esposa|mujer|papa|mama|padre|madre|abuelo|abuela|viej[oa]|suegr[oa]|pareja|novi[oa])|su (?:marido|esposo|esposa|papa|mama|padre|madre|abuelo|abuela))(?= )/g;

  function victima(textos){
    const lista = Array.isArray(textos) ? textos : (textos == null ? [] : [textos]);
    let lactante = false, nino = false, adulto = false;
    lista.forEach(crudo => {
      if(crudo == null || String(crudo).startsWith("[silencio")) return;
      // Con tilde es inequívoco; sin tilde, "bebe" también es del verbo beber. Por eso el
      // "bebé" con tilde se pasa a "bebito" antes de sacar las tildes: así vale sin
      // artículo y le sigue corriendo el filtro de negación ("no es un bebé").
      const t = limpiar(String(crudo).replace(/beb[ée]s?(?![a-zñáéíóú])/gi, x => /é/i.test(x) ? "bebito" : x), true);
      if(afirma(t, BEBE)) lactante = true;
      if(afirma(t, NENE, false, (m, antes, todo) => {
        // "Una chica de 25 años" no es una nena.
        const sigue = / (?:de |tiene |como de |de unos )?([a-z0-9]+)(?: y ([a-z]+))? anos? /.exec(todo.slice(m.index + m[0].length, m.index + m[0].length + 40));
        const n = sigue ? aNumero(sigue[1], sigue[2]) : null;
        return !(n != null && n >= 12);
      })) nino = true;
      if(afirma(t, ADULTO)) adulto = true;
      EDAD.lastIndex = 0;
      let m;
      while((m = EDAD.exec(t))){
        const n = aNumero(m[1], m[2]);
        // Si no era un número se reintenta una palabra más adelante; si lo era, se sigue
        // después: si no, "cuarenta y cinco años" volvía a leerse como "cinco años".
        if(n == null){ EDAD.lastIndex = m.index + 1; continue; }
        const antes = t.slice(0, m.index + 1);
        if(NO_ES_EDAD.test(antes)) continue;
        const sigue = t.slice(m.index + m[0].length);
        if(/^ de (?:embarazo|gestacion|embarazada)/.test(sigue)) continue;
        if(m[3].startsWith("mes")){ if(n < 12) lactante = true; else if(n < 144) nino = true; }
        else if(n < 1) lactante = true;
        else if(n < 12) nino = true;
        else adulto = true;
      }
    });
    /* Un adulto y un chico (o un bebé) nombrados a la vez no dicen quién es la víctima:
       "mi papá de 70 años no responde, mi hijita está llorando". Tomar al más chico le
       daba la técnica de un chico o de un bebé a un adulto en paro. Queda en null: el
       estado le hace preguntar al operador en la misma frase en que indica empezar, y su
       marca decide. Entre un chico y un bebé gana el más chico, que es el que decide la
       técnica: nunca se le indica a un bebé la de uno más grande. */
    if(adulto && (nino || lactante)) return null;
    return lactante ? "lactante" : nino ? "nino" : adulto ? "adulto" : null;
  }

  /* ---------- tipo de caso ----------
     Una expresión (o más) por caso. Las trampas de cada una están anotadas al lado: son
     las que salieron del relevamiento (taxonomía, sección 2). */

  // ahogamiento: "se ahoga / se está ahogando" SIN palabra de agua no es ahogamiento
  // (es atragantamiento o falta de aire). Hace falta agua en ese turno o en el anterior.
  const AGUA = / (?:agua|pileta|piscina|pelopincho|rio|mar|laguna|lago|arroyo|canal|olas?|nadando|nadar|nadaba|natatorio|playa|balneario|orilla|correntada|sumergid[oa]|se hundio|buceando|zambull[a-z]*|banandose|se metio al)(?= )/g;
  const AHOGA = / (?:se |me |nos )?(?:esta |estaba |estan )?(?:ahog[a-z]*|semiahogad[a-z]*)(?= )/g;
  const AGUA_SEGURO = / (?:(?:sa[cq][a-z]+|rescat[a-z]+|retir[a-z]+|extraj[a-z]+)(?: [a-z]+){0,3} (?:del agua|de la pileta|de la piscina|del rio|del mar|de la laguna|del lago|del arroyo|del canal|de la pelopincho)|se hundio|se estaba hundiendo|se hundia|(?:bajo|abajo d|debajo d)el agua|sumergid[oa]|flotando|en el fondo (?:de la pileta|del rio|de la laguna|del agua)|trago (?:mucha )?agua|se cayo (?:al agua|a la pileta|al rio|a la laguna|al canal|al arroyo)|ahogamiento|(?:un|una|el|la|al) ahogad[oa]|victima ahogada|szpilman)(?= )/g;
  const GRADO = / grado (?:[1-6]|uno|dos|tres|cuatro|cinco|seis)(?= )/g;
  const RESCATE = / rescat[a-z]+(?= )/g;
  const ESPUMA = / espuma(?= )/g;

  // atragantamiento: "se tragó" pastillas es intoxicación.
  const ATRAGANTA = / (?:atragant[a-z]*|atorad[oa]|se atoro|se esta atorando|se trabo con|se le fue (?:para|por) el otro lado|(?:quedo|trabo|atasco|atraveso|clavo)(?: [a-z]+){0,4} (?:en la garganta|garganta)|algo en la garganta|se (?:agarra|toma|lleva|aprieta)(?: las manos al| las manos en el| el)? cuello|manos (?:al|en el) cuello|no le sale la voz|no puede toser|cuerpo extrano|heimlich|ovace)(?= )/g;
  const TRAGO = / se trago (?:un|una|el|la|algo|unas?|unos)(?: [a-z]+){0,2}(?= )/g;
  const COMIENDO = / (?:comiendo|estaba comiendo|con la comida|comia)(?= )/g;

  // hemorragia: exige intensificador. "Sangra la nariz", "un poquito de sangre" y "tose
  // sangre" no son hemorragia grave.
  const HEMORRAGIA = / (?:sangr[a-z]* (?:[a-z]+ ){0,2}?(?:mucho|muchisimo|un monton|a chorros?|sin parar|demasiado|a mares|a borbotones)|(?:mucha|muchisima|demasiada|un monton de|pierde mucha) sangre|no (?:para|deja|paro|dejo) de sangrar|no le para (?:la sangre|de sangrar|el sangrado)|no (?:puedo|podemos|logro) parar(?:le)? (?:la sangre|el sangrado)|chorros? de sangre|sangre a chorros?|charco de sangre|desangr[a-z]*|hemorragia|empapad[oa] (?:de|en) sangre|arteria|apunal[a-z]*|punalada|cuchillazo|cuchillada|balead[oa]|balazo|(?:un|el) tiro|disparo|amput[a-z]*|se corto (?:la pierna|el brazo|la muneca|el cuello|la mano|el muslo|una arteria)|le falta (?:el|un|la|una|medio) (?:dedo|mano|brazo|pie|pierna)|se (?:volo|rebano|arranco) (?:el|un|la|una) (?:dedo|mano|brazo|pie))(?= )/g;
  const SANGRE_QUE_NO_ES = / (?:nariz|vomit[a-z]*|tose|tosio|tosiendo|escup[a-z]*|encias?)(?= )/g;
  const SANGRE_SEGURA = / (?:chorros?|charco|desangr[a-z]*|arteria|amput[a-z]*)(?= )/g;

  // alergia: "es alérgico a la aspirina" es un antecedente, no el caso: "alergi" sola no
  // clasifica, hace falta lo que la vuelve una reacción.
  const ANAFILAXIA = / (?:anafila[a-z]*|reaccion alergica|shock alergico|ataque de alergia|epipen|epi pen|autoinyector|adrenalina|se le (?:hincho|hincha|esta hinchando|inflamo|inflama|esta inflamando)(?: [a-z]+){0,3} (?:cara|labios?|lengua|garganta|boca|ojos|cuello|parpados)|(?:cara|labios?|lengua|garganta|boca) (?:hinchad[oa]s?|inflamad[oa]s?)|se le (?:cierra|cerro|esta cerrando) la garganta)(?= )/g;
  const ALERGICO = / alergi[a-z]*(?= )/g;
  const PICADURA_O_RONCHAS = / (?:ronchas?|urticaria|sarpullido|le pico (?:una |un )?(?:abeja|avispa|hormiga|bicho|insecto|abejorro)|picadura de (?:abeja|avispa|hormiga))(?= )/g;
  const REACCION = / (?:hinch[a-z]*|ronchas?|urticaria|le falta el aire|falta de aire|no puede respirar|le cuesta respirar|respira mal|garganta|se marea|mareo|se desmay[a-z]*|le pico|picadura|comio|se ahoga)(?= )/g;
  const ALERGIA_QUE_NO_ES = / (?:polen|estacional|rinitis|primavera)(?= )/g;

  // parto: "embarazada" sola no (golpeada es trauma, sangrando es hemorragia).
  const PARTO = / (?:(?:esta|estoy) por (?:parir|tener(?: el| al| a su| un)? bebe|dar a luz)|(?:esta|estoy) pariendo|va a (?:parir|nacer)|dando a luz|dar a luz|trabajo de parto|(?:de|en) parto|(?:un|el) parto|rompio (?:la )?bolsa|rompi (?:la )?bolsa|rompio aguas|se le ve la cabe[a-z]*|coronando|contracciones|pujos?|pujando|ganas de pujar|nacio (?:el|la|un|una)? ?(?:bebe|beba|nene|nena)|ya nacio|esta naciendo|acaba de nacer|recien nacid[oa]|(?:sale|saliendo|viene) el bebe|cordon umbilical|placenta)(?= )/g;

  // acv: los signos de un solo lado son fuertes. "Habla raro" y "no mueve el brazo" son
  // débiles: también los da un borracho, un diabético o una caída.
  const ACV = / (?:acv|a ce ve|acebe|ataque cerebral|derrame cerebral|(?:un|el) derrame(?! de)|accidente cerebrovascular|ictus|(?:boca|cara) (?:torcida|chueca|caida|de costado|desviada)|se le (?:torcio|tuerce|cayo|cae|desvio) (?:la boca|la cara|un lado|medio|el lado|la mitad)|un lado de la cara|(?:medio|mitad del|un lado del) cuerpo|medio cuerpo|hemiplej[a-z]*|paralizad[oa] (?:de )?(?:un|el) lado|se le durmio (?:medio|un lado|la mitad))(?= )/g;
  const ACV_DEBIL = / (?:habla (?:raro|rara|trabad[oa]|enredad[oa]|mal|cualquier cosa)|se le traba la lengua|lengua trabada|arrastra las palabras|no se le entiende|balbuce[a-z]*|no le salen las palabras|no le sale la palabra|no puede (?:levantar|mover|subir) (?:el|un|la|una) (?:brazo|mano)|no (?:levanta|mueve) (?:el|un) brazo|de golpe no ve)(?= )/g;

  // pecho: "ataque" solo es ambiguo (corazón, epilepsia, asma, pánico) y no clasifica.
  const PECHO = / (?:(?:dolor|duele|duelen|dolia|opresion|presion|peso|puntada|puntadas|pinchazo|aprieta|apreton|ardor|molestia|oprime)(?: [a-z]+){0,3} (?:el |del |en el |al )?pecho|pecho (?:le |me )?(?:duele|aprieta|oprime|arde)|infart[a-z]*|pre ?infarto|angina de pecho|ataque (?:al|de|del) corazon|ataque cardiaco|(?:le duele|dolor en|dolor de|se le durmio) el brazo izquierdo|precordial[a-z]*)(?= )/g;

  // respiratorio: con asma, inhalador o silbido es señal firme. "Le falta el aire" o "no
  // puede respirar" solos son señal DÉBIL (también es infarto, alergia o atragantamiento):
  // clasifican sólo si no hay ninguna otra señal en toda la llamada.
  const RESPIRATORIO = / (?:asma|asmatic[oa]|inhalador|(?:el|su|un|del) (?:puf|puff|paf)|salbutamol|epoc|silb[a-z]* (?:el |en el )?pecho|le silba|silbido|sibilancias?|broncoespasmo|crisis respiratoria|bronquiolitis|nebuliz[a-z]*)(?= )/g;
  const FALTA_AIRE = / (?:le falta el aire|me falta el aire|falta de aire|no puede respirar|no puedo respirar|le cuesta respirar|me cuesta respirar|respira (?:mal|con dificultad|muy rapido|agitad[oa])|no le entra (?:el )?aire|sin aire|disnea)(?= )/g;

  // convulsion: "temblando" de frío es temperatura.
  const CONVULSION = / (?:convuls[a-z]*|epilep[a-z]*|se sacude|sacudiendo(?:se)?|sacudidas|(?:temblando|tiembla|temblaba) (?:todo|toda|entero|entera)|se puso (?:dur[oa]|rigid[oa]|ties[oa])|esta (?:todo |toda )?(?:rigid[oa]|ties[oa])|ojos (?:para atras|en blanco|blancos|dados vuelta)|revoleo los ojos|se mordio la lengua)(?= )/g;
  const ESPUMA_BOCA = / espuma (?:por|en|de) la boca(?= )/g;
  const FRIO = / (?:frio|helad[oa]|congelad[oa])(?= )/g;

  // glucemia: "azúcar" sola no (el agua con azúcar se le da a cualquiera).
  const GLUCEMIA = / (?:diabet[a-z]*|insulina|hipoglucemi[a-z]*|hiperglucemi[a-z]*|glucemia|glucosa|glucometro|(?:bajo|subio|baja|sube|bajando) (?:el |la )?azucar|azucar (?:baja|bajo|alta|alto|por el piso)|(?:baja|bajon|pico) de azucar)(?= )/g;

  // intoxicacion: "tomó una pastilla" (su remedio) no clasifica. "Borracho" es débil:
  // con un golpe, el caso es el golpe.
  const INTOXICACION = / (?:intoxic[a-z]*|sobredosis|envenen[a-z]*|veneno|raticida|lavandina|soda caustica|(?:se )?(?:tomo|trago|tomaron)(?: [a-z]+){0,3} (?:pastillas|remedios|medicamentos|comprimidos)|pastillas de mas|(?:todas|muchas|demasiadas|un monton de|un blister de|la caja de|el frasco de) (?:las )?pastillas|(?:tomo|trago|tomaron|se tomo|se trago) (?:una|la|toda la|media|un|el|todo el) (?:caja|blister|tira|frasco) de|drogad[oa]|se drogo|cocaina|monoxido|brasero|calefon|olor a gas|(?:escape|perdida|fuga) de gas|vibora|yarara|serpiente|culebra|alacran|escorpion|(?:pico|mordio|picadura de|mordedura de) (?:una |un )?(?:arana|abeja|avispa)|coma alcoholico)(?= )/g;
  const ALCOHOL = / (?:borrach[oa]|alcoholizad[oa]|tomo (?:mucho|demasiado) alcohol|tomo de mas|ebri[oa])(?= )/g;

  // temperatura: "golpe" solo es trauma; "fiebre" sola no es nada de esto.
  const TEMPERATURA = / (?:golpe de calor|insola[a-z]*|agotamiento por calor|dejo de transpirar|no transpira|hipotermi[a-z]*|congelad[oa]|(?:esta|estaba|quedo|todo|toda) helad[oa]|muert[oa] de frio|no para de temblar|tirit[a-z]*|(?:temblando|tiembla) de frio)(?= )/g;
  const AL_SOL = / (?:al sol|bajo el sol|con este calor|del calor)(?= )/g;
  const MAL_POR_CALOR = / (?:confus[a-z]*|confundid[oa]|desmay[a-z]*|mare[a-z]*|delira[a-z]*|rar[oa]|no reacciona|no responde|hirviendo|muy caliente)(?= )/g;

  // trauma: "se cayó de golpe" o "cayó redondo" sin mecanismo es un desmayo.
  // Ojo con "se cayo de…": la negación va DESPUÉS de la preposición y sin el espacio
  // final adentro; con el espacio, el (?= ) del cierre nunca calzaba y "se cayó del
  // techo" quedaba sin clasificar (pruebas/casos.test.mjs).
  const TRAUMA = / (?:se cayo (?:de|desde|del)(?! (?:golpe|repente|pronto|la nada|costado)(?= ))|caida (?:de|desde|del)|cayo (?:de|desde|del) (?:un|una|la|el|arriba|altura)|choque(?! electrico)|choco|chocaron|atropell[a-z]*|accidente(?! cerebro)|moto|se golpeo|golpe en (?:la|el)|se pego en la cabeza|golpeo la cabeza|se dio (?:la cabeza|un golpe)|de cabeza|no (?:mueve|siente|puede mover) (?:las piernas|los brazos|el cuerpo|las manos|los pies)|fractur[a-z]*|quebr[a-z]*|se rompio (?:el|la|un|una)|se le ve el hueso|se partio|le duele (?:mucho )?el cuello|dolor de cuello|cervical|la columna|zambull[a-z]*|lo revolco (?:una|la) ola|esguince|se doblo (?:el|la)|luxa[a-z]*|disloc[a-z]*|traumatismo|politrauma[a-z]*|tec|una herida|se corto(?! la luz| la llamada| la comunicacion| la linea| la corriente| el telefono| el llamado)|un corte(?! de luz)|un tajo)(?= )/g;

  // quemadura: la de sol no; el electrocutado que no responde es paro (lo decide detectarParo).
  const QUEMADURA = / (?:se quemo(?! (?:con|por|al) el sol)|quemaduras?(?! de sol)|quemad[oa]s?(?! (?:por|del|con) el sol)|agua (?:hirviendo|caliente)|aceite (?:hirviendo|caliente)|se (?:le )?(?:volco|cayo|derramo|tiro) (?:encima )?(?:la pava|la olla|la sopa|el mate)|se prendio fuego|prendido fuego|en llamas|ampollas?|acido|lo agarro la corriente|la agarro la corriente|le agarro la corriente|electrocut[a-z]*|descarga electrica|choque electrico|patada (?:de corriente|electrica)|quedo pegad[oa])(?= )/g;

  // inconsciente y desmayo: provisorios. "Se desmayó" solo, al principio, no dice todavía
  // si volvió en sí: queda como desmayo hasta que se sepa si responde y respira.
  const COMO_DORMIDO = / (?:como dormid[oa]|no vuelve en si|sin conocimiento)(?= )/g;
  const DESMAYO = / (?:se desmayo|desmay[a-z]*|se desvanecio|desvanec[a-z]*|se desplomo|desplom[a-z]*|cayo redond[oa]|se cayo redond[oa]|(?:le |se le )?bajo la presion|baja de presion|se mareo y se cayo|perdio el conocimiento|lipotimia|sincope)(?= )/g;

  /* "Se ahoga con la comida" es atragantamiento; "se ahoga" con agua cerca, ahogamiento;
     "se ahoga" a secas no dice cuál de los tres es y no clasifica. Devuelve, por turno,
     si ese "se ahoga" fue con agua o con algo. Lo usan caso() y paro(). */
  function ahogos(T){
    const conAgua = T.map(() => false), conAlgo = T.map(() => false);
    T.forEach((t, i) => {
      AHOGA.lastIndex = 0;
      let m;
      while((m = AHOGA.exec(t))){
        AHOGA.lastIndex = m.index + 1;
        if(anulada(t.slice(0, m.index + 1))) continue;
        const sigue = t.slice(m.index + m[0].length);
        if(/^ (?:con|comiendo|tomando|por comer)(?= )/.test(sigue)){
          if(!/^ con (?:el |la |un |una |tanta |mucha )?(?:agua|ola|olas|correntada)(?= )/.test(sigue)) conAlgo[i] = true;
          continue;
        }
        if(afirma(t, COMIENDO)){ conAlgo[i] = true; continue; }
        if(afirma(t, AGUA, true) || (i > 0 && afirma(T[i-1], AGUA, true)) || afirma(t, GRADO, true)) conAgua[i] = true;
      }
    });
    return { conAgua, conAlgo };
  }
  // Las señales de atragantamiento de un turno (sin contar el "se ahoga con…", que va
  // por ahogos()). Tragarse pastillas o lavandina es una intoxicación, no esto.
  function atragantaEn(t){
    return afirma(t, ATRAGANTA)
      || afirma(t, TRAGO, false, (m) => !/(?:pastilla|remedio|medicament|comprimido|veneno|lavandina|blister)/.test(m[0]))
      || (afirma(t, COMIENDO) && afirma(t, FALTA_AIRE));
  }
  /* El atragantado que, en ese turno o después, se desmaya, se desploma o deja de
     responder, sin que después se diga que volvió en sí. */
  function atragantadoQuePerdioElConocimiento(T){
    const conAlgo = ahogos(T).conAlgo;
    const desde = T.findIndex((t, i) => conAlgo[i] || atragantaEn(t));
    if(desde < 0) return false;
    for(let i = desde; i < T.length; i++){
      if(!(afirma(T[i], SE_DESPLOMO) || afirma(T[i], INCONSCIENTE) || afirma(T[i], NO_RESPONDE, true))) continue;
      if(!T.slice(i).some(t => afirma(t, VOLVIO))) return true;
    }
    return false;
  }

  function caso(textos){
    const T = turnos(textos);
    if(!T.length) return null;
    const hay = (re, sinFiltro, acepta) => T.some(t => afirma(t, re, sinFiltro, acepta));
    const hayAgua = hay(AGUA, true);
    const s = {};

    const ah = ahogos(T);
    s.ahogamiento = ah.conAgua.some(Boolean) || hay(AGUA_SEGURO)
      || T.some(t => afirma(t, RESCATE) && afirma(t, AGUA, true))
      || (hayAgua && hay(ESPUMA));

    s.atragantamiento = ah.conAlgo.some(Boolean) || T.some(atragantaEn);

    s.paro = paro(textos);

    s.hemorragia = T.some(t => afirma(t, HEMORRAGIA) && (!afirma(t, SANGRE_QUE_NO_ES, true) || afirma(t, SANGRE_SEGURA)));

    s.alergia = hay(ANAFILAXIA)
      || (hay(PICADURA_O_RONCHAS) && hay(REACCION, false, (m) => !/^ (?:ronchas?|urticaria|le pico|picadura)$/.test(m[0])))
      || (hay(ALERGICO) && !hay(ALERGIA_QUE_NO_ES, true) && hay(REACCION));

    s.parto = hay(PARTO);
    s.glucemia = hay(GLUCEMIA);
    s.trauma = hay(TRAUMA);
    s.intoxicacion = hay(INTOXICACION) || (hay(ALCOHOL) && !s.trauma);
    s.acv = hay(ACV) || (hay(ACV_DEBIL) && !s.glucemia && !s.intoxicacion && !s.trauma && !hay(ALCOHOL));
    s.pecho = hay(PECHO);
    s.respiratorio = hay(RESPIRATORIO);
    s.convulsion = hay(CONVULSION, false, (m, antes, t) => !(m[0].includes("tembl") && afirma(t, FRIO, true)))
      || (!hayAgua && hay(ESPUMA_BOCA));
    s.temperatura = hay(TEMPERATURA) || T.some(t => afirma(t, AL_SOL, true) && afirma(t, MAL_POR_CALOR, true));
    s.quemadura = hay(QUEMADURA);
    s.inconsciente = hay(NO_DESPIERTA, true) || hay(ESTA_INCONSCIENTE) || hay(COMO_DORMIDO);
    s.desmayo = hay(DESMAYO);

    for(let i = 0; i < ORDEN_CASOS.length; i++) if(s[ORDEN_CASOS[i]]) return ORDEN_CASOS[i];
    // La señal débil: sólo si no hubo ninguna otra en toda la llamada.
    if(hay(FALTA_AIRE)) return "respiratorio";
    return null;
  }

  return { limpiar, caso, paro, indicio, inconsciente, victima };
})();

/* Minúsculas, sin tildes, sin signos, espacios simples, y un espacio al principio y al
   final. La eñe queda como ene ("años" → "anos"): así el texto queda sólo con a-z, 0-9 y
   espacios, que es lo que esperan las expresiones que se le aplican. */
function normalizar(txt){ return DETECTOR.limpiar(txt, false); }

/* textos: lo que dijo el ALUMNO, un string por turno. Devuelve el id del caso o null.
   No adivina: sin una señal clara, null. Da `paro` sólo si detectarParo(). */
function detectarCaso(textos){ return DETECTOR.caso(textos); }

/* Verdadero sólo con una señal inequívoca de paro o de RCP en curso: "no respira" junto
   con "no responde" (en el mismo turno o en turnos distintos), "boquea", "no tiene pulso",
   "un paro / en paro / paro cardíaco", "paro respiratorio" si nadie dijo que tiene pulso
   (con pulso es un grado 5), una RCP afirmada con palabra inequívoca (no un curso de
   RCP), no responde y respira de forma anormal (ronca, de a ratos, no sabe), o un
   atragantado que pierde el conocimiento. NUNCA con "paro" suelto, "apretando",
   "empujando" o "compresiones" solas, "no puede respirar", o "respira bien" + "no
   responde". */
function detectarParo(textos){ return DETECTOR.paro(textos); }

/* Verdadero con ALGUNA señal suelta (no respira, no responde, inconsciente, sin pulso,
   boquea, morado o azul), salvo que lo último que dijo de la respiración sea que respira
   bien. Es lo mínimo para creerle al modelo una marca de paro. */
function indicioDeParo(textos){ return DETECTOR.indicio(textos); }

/* Verdadero si dijo que no responde, no reacciona, no se despierta, que está inconsciente
   o desmayado, y DESPUÉS no dijo que ya volvió en sí, que ya habla o que se despertó. */
function detectarInconsciente(textos){ return DETECTOR.inconsciente(textos); }

/* "lactante" | "nino" | "adulto" | null. Ante varias señales gana la más chica, que es
   la que decide la técnica de la RCP. */
function detectarVictima(textos){ return DETECTOR.victima(textos); }

/* Qué caso queda después de un turno. `actual` es el que había, `deTexto` el que salió
   de lo que dijo el alumno y `deMarca` el de la marca [[CASO:id]] del operador.
   Sólo ESCALA: un caso reemplaza a otro únicamente si está más arriba en ORDEN_CASOS.
   Nunca baja ni vuelve a nulo. Como los provisorios son los tres últimos, cualquier caso
   los reemplaza, y entre ellos tampoco hay ida y vuelta (`desmayo` no pisa a
   `inconsciente`). Una marca con un id que no existe se ignora. */
function resolverCaso(actual, deTexto, deMarca){
  const lugar = id => (typeof id === "string" ? ORDEN_CASOS.indexOf(id) : -1);
  let candidato = null;
  [deTexto, deMarca].forEach(id => {
    if(lugar(id) === -1) return;
    if(candidato === null || lugar(id) < lugar(candidato)) candidato = id;
  });
  if(lugar(actual) === -1) return candidato;
  if(candidato !== null && lugar(candidato) < lugar(actual)) return candidato;
  return actual;
}

// El caso con ese id, o `otro` si no existe (o si todavía no hay caso).
function casoDe(id){
  const propio = typeof id === "string" && Object.prototype.hasOwnProperty.call(CASOS, id);
  return propio ? CASOS[id] : CASOS.otro;
}

/* La tabla que va en la parte FIJA del prompt: una línea por caso y la regla de
   prioridad. Lo que el operador sabe de cada cuadro no va acá: viaja en el estado de la
   llamada, sólo el del caso activo, para que el prompt no crezca con dieciocho guías. */
function tablaDeCasos(){
  const lineas = ORDEN_CASOS.filter(id => Object.prototype.hasOwnProperty.call(CASOS, id))
    .map(id => id + ": " + CASOS[id].reconocer);
  lineas.push("Si lo que te cuentan calza en más de uno, vale el que está más arriba en esta lista. Los tres últimos (inconsciente, desmayo, otro) son provisorios: apenas aparece otra causa, vale esa. El tipo sólo puede subir en la lista, nunca bajar.");
  return lineas.join("\n");
}

/* ---------------- rúbrica y puntaje ----------------
   El puntaje lo calcula la app a partir de la rúbrica, no el modelo: el modelo
   sólo dice, criterio por criterio, si está logrado, a medias o si faltó. Así una
   llamada mala no puede zafar con un número generoso. Parcial vale la mitad del
   peso, y si falta un criterio crítico el total queda topeado.

   La rúbrica efectiva de una práctica se arma al TERMINAR la llamada, con el caso final:
   - guardavidas: CHECKS con los ajustes del caso (`cambia`) más sus criterios propios.
   - lego con paro: los diez CHECKS_LEGO, más CHECK_VENTILACIONES si la RCP llevaba
     ventilaciones (un ahogado, un chico o un bebé). Los criterios del caso no se usan.
   - lego sin paro: CHECKS_LEGO sin lo de la RCP (`rcp`, `dea`, `altavoz`), sin `linea` si
     el operador no se quedaba en línea, con `ayuda` reescrito, más
     CHECK_INDICACIONES_LEGO y los criterios del caso.
   Los pesos NO tienen que sumar 100: puntuar() normaliza sobre el total que haya.
   opciones: {paro, victima, enLinea}, todas opcionales. Sin caso vale `otro`. */
function rubrica(perfil, casoId, opciones){
  const c = casoDe(casoId) || {};
  const o = opciones || {};
  const copia = x => Object.assign({}, x);
  if(perfil !== "lego"){
    const g = c.guardavidas || {};
    const cambia = g.cambia || {};
    return CHECKS.map(x => Object.assign({}, x, cambia[x.id] || {})).concat((g.checks || []).map(copia));
  }
  const l = c.lego || {};
  const paro = Boolean(o.paro) || casoId === "paro";
  if(paro){
    const R = CHECKS_LEGO.map(copia);
    if(c.rcp === "ventilaciones" || o.victima === "nino" || o.victima === "lactante") R.push(copia(CHECK_VENTILACIONES));
    return R;
  }
  const enLinea = ("enLinea" in o && o.enLinea !== undefined) ? Boolean(o.enLinea) : Boolean(l.enLinea);
  const fuera = ["rcp", "dea", "altavoz"].concat(enLinea ? [] : ["linea"]);
  return CHECKS_LEGO.filter(x => fuera.indexOf(x.id) === -1)
    .map(x => x.id === "ayuda" ? Object.assign({}, x, AYUDA_SIN_PARO) : copia(x))
    .concat([copia(CHECK_INDICACIONES_LEGO)], (l.checks || []).map(copia));
}

function normEstado(v){
  const st = String(v||"falto").toLowerCase().replace(/ó/g,"o").trim();
  return ["logrado","parcial","falto"].indexOf(st)===-1 ? "falto" : st;
}

/* datos: lo que devolvió el evaluador ({items:[{id, estado}]}). R: la rúbrica de la
   práctica (la de rubrica()). tope: el puntaje máximo si faltó un criterio crítico.
   Deja en datos.topeado si el tope se aplicó. */
function puntuar(d, R, tope){
  const rub = (Array.isArray(R) && R.length) ? R : CHECKS;
  const max = (typeof tope === "number" && isFinite(tope)) ? tope : TOPE_CRITICO;
  d = d || {};
  const byId = {};
  (Array.isArray(d.items)?d.items:[]).forEach(i=>{ if(i&&i.id) byId[String(i.id)]=i; });
  let suma = 0, pesos = 0, faltoCritico = false;
  rub.forEach(c=>{
    const st = normEstado((byId[c.id]||{}).estado);
    suma += c.peso * (st==="logrado" ? 1 : st==="parcial" ? 0.5 : 0);
    pesos += c.peso;
    if(c.critico && st==="falto") faltoCritico = true;
  });
  const total = pesos ? Math.round(suma/pesos*100) : 0;
  d.topeado = faltoCritico && total > max;
  return faltoCritico ? Math.min(total, max) : total;
}

/* Todo lo que usan las páginas y las pruebas. En el navegador cada nombre ya es global;
   esto es para cargarlo desde Node y para tener la lista en un solo lugar. */
const PROTOCOLOS = { CASOS, ORDEN_CASOS, CHECKS, CHECKS_LEGO, CHECK_INDICACIONES_LEGO,
  CHECK_VENTILACIONES, AYUDA_SIN_PARO, TOPE_CRITICO, ESENCIALES, EXTRAS, ESENCIALES_LEGO,
  EXTRAS_LEGO, DIFF_TXT, APERTURA, GLOSARIO, CONTEXTO, CONTEXTO_LEGO, GLOSARIO_LEGO,
  RCP_COMPRESIONES, RCP_VENTILACIONES, RCP_VENTILACIONES_ADULTO, RCP_VENTILACIONES_LACTANTE,
  RCP_SITUACIONES, TOPE_EXTRAS, AVISAR_SIN_AVANCE, TOPE_SIN_AVANCE, TOPE_SIN_AVANCE_LEGO,
  TOPE_MINUTOS, TOPE_MINUTOS_LEGO, TOPE_EXTRAS_LEGO, TOPE_INDICACIONES_LEGO, CADENCIA, ARRIBOS,
  NUMEROS, PISTAS_UBICACION, NUMEROS_QUE_NO_UBICAN, rubrica, puntuar, normEstado, normalizar,
  detectarCaso, detectarParo, indicioDeParo, detectarInconsciente, detectarVictima, resolverCaso,
  casoDe, tablaDeCasos };
if (typeof module === "object" && module.exports) module.exports = PROTOCOLOS;
