// helpers/clinicalSummary.js

/**
 * Clasificador de severidad PHQ-9 según score total.
 */
function classifyPHQ9(score) {
    if (score == null || Number.isNaN(Number(score))) return null;

    const n = Number(score);
    if (n >= 20) return 'Depresión severa';
    if (n >= 15) return 'Depresión moderadamente severa';
    if (n >= 10) return 'Depresión moderada';
    if (n >= 5)  return 'Depresión leve';

    return 'Sin síntomas depresivos clínicamente significativos';
}

/**
 * Clasificador de severidad GAD-7 según score total.
 */
function classifyGAD7(score) {
    if (score == null || Number.isNaN(Number(score))) return null;

    const n = Number(score);
    if (n >= 15) return 'Ansiedad severa';
    if (n >= 10) return 'Ansiedad moderada';
    if (n >= 5)  return 'Ansiedad leve';

    return 'Sin síntomas ansiosos clínicamente significativos';
}

/**
 * Intenta extraer los últimos PHQ-9 y GAD-7 desde una lista de tests.
 * Soporta nombres tipo: PHQ9, PHQ-9, phq9, GAD7, GAD-7, gad7.
 */
function extractScalesFromTests(tests = []) {
    let lastPHQ9 = null;
    let lastGAD7 = null;

    for (const t of tests) {
        const tipo = (t.tipo_test || t.tipo || '').toString().toUpperCase();

        if (tipo.includes('PHQ')) {
            if (!lastPHQ9 || t.fecha_realizacion > lastPHQ9.fecha_realizacion) {
                lastPHQ9 = t;
            }
        }

        if (tipo.includes('GAD')) {
            if (!lastGAD7 || t.fecha_realizacion > lastGAD7.fecha_realizacion) {
                lastGAD7 = t;
            }
        }
    }

    return { phq9: lastPHQ9, gad7: lastGAD7 };
}

/**
 * Calcula stats de ánimo (promedio y cantidad) a partir de una serie
 * de check-ins con valencia.
 */
function computeMoodStatsFromSeries(series = []) {
    if (!Array.isArray(series) || series.length === 0) {
        return { promedio_animo: null, total_registros: 0 };
    }

    let suma = 0;
    let count = 0;

    for (const item of series) {
        const v = Number(item.valencia ?? item.valor ?? item.score);
        if (!Number.isNaN(v)) {
            suma += v;
            count += 1;
        }
    }

    if (count === 0) {
        return { promedio_animo: null, total_registros: 0 };
    }

    return {
        promedio_animo: suma / count,
        total_registros: count
    };
}

/**
 * Genera un texto de resumen clínico semiautomatizado para el reporte PDF.
 *
 * Espera un objeto tipo (flexible):
 * {
 *   patient,     // { nombre, apellido, fecha_registro, estado_tratamiento, ... }
 *   therapist,   // opcional: { nombre, apellido, nombre_completo, especialidad }
 *   tests,       // array de resultados_tests (para extraer PHQ-9 / GAD-7)
 *   phq9, gad7,  // opcionales, si ya vienen prefiltrados
 *   moodStats,   // { promedio_animo, total_registros } opcional
 *   moodSeries,  // array de { fecha_hora, valencia } opcional
 *   checkins,    // array de check-ins emocionales (opcional)
 *   sessions,    // array de citas
 *   incidents    // array de incidencias/crisis
 * }
 *
 * Importante: aquí solo se arma el TEXTO. El logo de MindCare,
 * tipografía y maquetación los controla el generador de PDF.
 */
function generateClinicalSummary(data = {}) {
    const patient   = data.patient   || {};
    const therapist = data.therapist || {};

    const tests     = Array.isArray(data.tests) ? data.tests : [];
    const sessions  = Array.isArray(data.sessions) ? data.sessions : [];
    const incidents = Array.isArray(data.incidents) ? data.incidents : [];

    // Escalas: priorizamos phq9/gad7 explícitos; si no, los derivamos de tests.
    let phq9 = data.phq9 || null;
    let gad7 = data.gad7 || null;

    if ((!phq9 || !gad7) && tests.length > 0) {
        const extracted = extractScalesFromTests(tests);
        phq9 = phq9 || extracted.phq9;
        gad7 = gad7 || extracted.gad7;
    }

    // Estado de ánimo: priorizamos moodStats si viene, si no lo calculamos.
    let moodStats = data.moodStats || null;
    const moodSeries = Array.isArray(data.moodSeries)
        ? data.moodSeries
        : Array.isArray(data.checkins)
            ? data.checkins
            : [];

    if (!moodStats) {
        moodStats = computeMoodStatsFromSeries(moodSeries);
    }

    const checkins = Array.isArray(data.checkins) ? data.checkins : moodSeries;

    const nombrePaciente = `${patient.nombre || ''} ${patient.apellido || ''}`
        .trim() || 'El/la paciente';
    const nombreTerapeuta =
        therapist.nombre_completo ||
        (therapist.nombre && therapist.apellido
            ? `${therapist.nombre} ${therapist.apellido}`
            : therapist.nombre || null);

    const especialidadTerapeuta =
        therapist.especialidad || patient.especialidad_terapeuta || null;

    // -------------------------------------------------------------------
    // INICIO DEL TEXTO
    // -------------------------------------------------------------------
    let texto = '';

    // 1) Presentación general
    texto += `${nombrePaciente} se encuentra actualmente en seguimiento psicoterapéutico dentro de la plataforma MindCare, `;
    if (nombreTerapeuta) {
        texto += `bajo la conducción clínica de ${nombreTerapeuta}`;
        if (especialidadTerapeuta) {
            texto += `, especialista en ${especialidadTerapeuta}`;
        }
        texto += '. ';
    } else {
        texto += 'con acompañamiento clínico por parte del equipo profesional de la plataforma. ';
    }

    if (patient.estado_tratamiento) {
        texto += `El estado actual del tratamiento se encuentra registrado como "${patient.estado_tratamiento}". `;
    }

    if (patient.fecha_registro) {
        texto += `El ingreso a MindCare se produjo aproximadamente el ${new Date(
            patient.fecha_registro
        ).toLocaleDateString('es-ES')}. `;
    }

    texto += 'El presente documento integra información sintética sobre síntomas, evolución emocional, adherencia a las sesiones e incidencias de riesgo registradas recientemente.\n\n';

    // -------------------------------------------------------------------
    // 2) Resultados de escalas estandarizadas (PHQ-9 y GAD-7)
    // -------------------------------------------------------------------
    const seccionEscalas = [];

    if (phq9) {
        const scorePHQ = Number(
            phq9.puntaje_total ??
            phq9.score ??
            phq9.total ??
            phq9.puntaje
        );
        if (!Number.isNaN(scorePHQ)) {
            const severidadPHQ = phq9.nivel_severidad || classifyPHQ9(scorePHQ);
            let linea = `En la escala PHQ-9, orientada a la detección de sintomatología depresiva, el paciente obtuvo un puntaje total de ${scorePHQ}`;
            if (severidadPHQ) {
                linea += `, compatible con un cuadro de ${severidadPHQ.toLowerCase()}.`;
            } else {
                linea += '.';
            }

            if (phq9.fecha_realizacion) {
                linea += ` Esta medición corresponde a la aplicación realizada el ${new Date(
                    phq9.fecha_realizacion
                ).toLocaleDateString('es-ES')}.`;
            }

            seccionEscalas.push(linea);
        }
    }

    if (gad7) {
        const scoreGAD = Number(
            gad7.puntaje_total ??
            gad7.score ??
            gad7.total ??
            gad7.puntaje
        );
        if (!Number.isNaN(scoreGAD)) {
            const severidadGAD = gad7.nivel_severidad || classifyGAD7(scoreGAD);
            let linea = `En la escala GAD-7, orientada a la evaluación de ansiedad generalizada, el puntaje total obtenido fue de ${scoreGAD}`;
            if (severidadGAD) {
                linea += `, lo que se interpreta clínicamente como ${severidadGAD.toLowerCase()}.`;
            } else {
                linea += '.';
            }

            if (gad7.fecha_realizacion) {
                linea += ` Esta medición corresponde a la aplicación realizada el ${new Date(
                    gad7.fecha_realizacion
                ).toLocaleDateString('es-ES')}.`;
            }

            seccionEscalas.push(linea);
        }
    }

    if (seccionEscalas.length > 0) {
        texto += 'En relación con la evaluación sintomática mediante escalas estandarizadas, se destacan los siguientes resultados:\n\n';
        seccionEscalas.forEach((linea) => {
            texto += `- ${linea}\n`;
        });
        texto += '\n';
    } else {
        texto += 'Hasta el momento no se registran aplicaciones recientes de escalas estandarizadas PHQ-9 o GAD-7, o bien los resultados disponibles no permiten una interpretación cuantitativa confiable.\n\n';
    }

    // -------------------------------------------------------------------
    // 3) Evolución del estado de ánimo y check-ins emocionales
    // -------------------------------------------------------------------
    const promedioAnimo =
        moodStats && moodStats.promedio_animo != null
            ? Number(moodStats.promedio_animo)
            : null;
    const totalCheckins =
        (moodStats && moodStats.total_registros) ||
        (Array.isArray(checkins) ? checkins.length : 0) ||
        0;

    if (totalCheckins > 0 && promedioAnimo !== null && !Number.isNaN(promedioAnimo)) {
        let cualitativo = 'una tendencia emocional neutra o moderada';
        if (promedioAnimo >= 4) {
            cualitativo = 'una tendencia hacia un estado de ánimo predominantemente positivo y estable';
        } else if (promedioAnimo <= 2) {
            cualitativo = 'una tendencia hacia un estado de ánimo bajo o desfavorable, que requiere seguimiento cercano';
        }

        texto += `En cuanto a la autoevaluación del estado de ánimo, se cuenta con ${totalCheckins} registros recientes de check-ins emocionales. El promedio de valencia reportado es de ${promedioAnimo.toFixed(
            1
        )} en una escala de 1 a 5, lo que sugiere ${cualitativo}. `;
        texto += 'Se recomienda continuar monitoreando estos registros para identificar variaciones significativas, especialmente descensos bruscos o patrones de deterioro sostenido.\n\n';
    } else {
        texto += 'No se dispone de un número suficiente de check-ins emocionales como para trazar una tendencia confiable del estado de ánimo. La incorporación sistemática de estos registros permitiría una monitorización más fina de la evolución subjetiva del paciente.\n\n';
    }

    // -------------------------------------------------------------------
    // 4) Adherencia a las sesiones y dinámica del tratamiento
    // -------------------------------------------------------------------
    if (sessions.length > 0) {
        const sesionesCompletadas = sessions.filter(
            (s) => (s.estado || '').toLowerCase() === 'completada'
        ).length;
        const sesionesCanceladas = sessions.filter(
            (s) => (s.estado || '').toLowerCase() === 'cancelada'
        ).length;
        const sesionesOtras = sessions.length - sesionesCompletadas - sesionesCanceladas;

        texto += `En el periodo reciente se registran ${sessions.length} citas agendadas. De ellas, ${sesionesCompletadas} fueron efectivamente completadas`;
        if (sesionesCanceladas > 0) {
            texto += ` y ${sesionesCanceladas} fueron canceladas o reprogramadas`;
        }
        texto += '. ';

        texto += 'Desde el punto de vista de la adherencia, se observa que ';

        if (sesionesCompletadas === 0) {
            texto += 'el paciente aún no ha consolidado un esquema regular de asistencia, lo que limita el impacto terapéutico de la intervención. ';
        } else if (sesionesCanceladas > sesionesCompletadas) {
            texto += 'existen dificultades relevantes para sostener la continuidad de las sesiones (con un número elevado de cancelaciones), aspecto que conviene explorar y abordar en el espacio terapéutico. ';
        } else {
            texto += 'la asistencia a las sesiones ha sido globalmente aceptable, lo que favorece la continuidad del proceso de acompañamiento psicológico. ';
        }

        if (sesionesOtras > 0) {
            texto += `Se registran además ${sesionesOtras} citas en otros estados administrativos (reprogramadas, en espera de confirmación u otras modalidades). `;
        }

        texto += '\n\n';
    } else {
        texto += 'No se registran sesiones completadas en el periodo considerado para este informe, por lo que no es posible evaluar la adherencia al tratamiento ni la dinámica de trabajo en sesión. Se sugiere revisar la agenda y promover al menos un contacto clínico inicial o de seguimiento.\n\n';
    }

    // -------------------------------------------------------------------
    // 5) Incidencias y episodios de riesgo
    // -------------------------------------------------------------------
    if (incidents.length > 0) {
        const abiertas = incidents.filter((i) => {
            const estado = (i.estado || '').toUpperCase();
            return estado !== 'RESUELTO';
        });

        const criticas = incidents.filter((i) => {
            const nivel = (
                i.nivel_gravedad ||
                i.nivel ||
                i.nivel_texto ||
                ''
            ).toUpperCase();
            return (
                nivel.includes('CRIT') ||
                nivel === 'ALTA' ||
                nivel === 'ALTO' ||
                nivel === 'CRITICO' ||
                nivel === 'CRÍTICO'
            );
        });

        texto += `En el registro de incidencias clínicas se han documentado ${incidents.length} eventos relevantes asociados a momentos de mayor vulnerabilidad o riesgo. `;
        texto += `De ellos, ${abiertas.length} incidencias se encuentran actualmente abiertas o en seguimiento activo. `;

        if (criticas.length > 0) {
            texto += 'Dentro de estas, se identifican episodios catalogados como de alto o crítico nivel de gravedad, para los cuales se recomienda una supervisión estrecha y la posible activación de protocolos de intervención en crisis. ';
        }

        texto += 'Estos episodios suelen estar vinculados a incrementos abruptos del malestar emocional, conflictos interpersonales significativos o la aparición de ideación autolesiva o suicida, por lo que su adecuada documentación y análisis resulta fundamental para la planificación terapéutica.\n\n';
    } else {
        texto += 'Hasta la fecha no se han registrado incidencias clínicas de riesgo en el sistema MindCare para este paciente, o bien las mismas han sido resueltas sin nuevos episodios recientes. No obstante, se recomienda mantener la vigilancia clínica habitual, especialmente ante cambios relevantes en el contexto vital o en el estado emocional.\n\n';
    }

    // -------------------------------------------------------------------
    // 6) Orientaciones generales para el plan terapéutico
    // -------------------------------------------------------------------
    texto += 'A partir de la información integrada en este reporte, se sugiere que el plan terapéutico continúe centrado en los siguientes ejes orientativos:\n\n';
    texto += '- Monitorear de forma periódica la sintomatología depresiva y ansiosa mediante escalas estandarizadas y check-ins emocionales.\n';
    texto += '- Profundizar en el desarrollo de estrategias de afrontamiento, regulación emocional y fortalecimiento de la red de apoyo del paciente.\n';
    texto += '- Revisar conjuntamente las barreras que puedan estar interfiriendo con la asistencia regular a las sesiones (horarios, motivación, factores contextuales).\n';
    texto += '- Mantener criterios claros para la activación de protocolos de crisis cuando se detecten indicadores de riesgo elevado (por ejemplo, ideación suicida activa, planes concretos de autoagresión o conductas impulsivas de alto riesgo).\n\n';

    texto += 'Este resumen tiene un carácter clínico orientativo y debe interpretarse siempre en conjunto con la historia clínica completa, las notas de sesión y el juicio profesional del terapeuta a cargo.';

    return texto;
}

module.exports = {
    generateClinicalSummary
};
