// helpers/clinicalSummary.js

/**
 * Clasificador de severidad PHQ-9 según score total.
 */
function classifyPHQ9(score) {
    if (score == null || isNaN(score)) return null;

    if (score >= 20) return 'Depresión severa';
    if (score >= 15) return 'Depresión moderadamente severa';
    if (score >= 10) return 'Depresión moderada';
    if (score >= 5)  return 'Depresión leve';

    return 'Sin síntomas depresivos clínicamente significativos';
}

/**
 * Clasificador de severidad GAD-7 según score total.
 */
function classifyGAD7(score) {
    if (score == null || isNaN(score)) return null;

    if (score >= 15) return 'Ansiedad severa';
    if (score >= 10) return 'Ansiedad moderada';
    if (score >= 5)  return 'Ansiedad leve';

    return 'Sin síntomas ansiosos clínicamente significativos';
}

/**
 * Genera un texto de resumen clínico semiautomatizado.
 * Este helper NO accede a BD, solo arma texto con base en los datos que ya le pasas.
 *
 * Espera un objeto tipo:
 * {
 *   patient,
 *   therapist,
 *   phq9,        // { puntaje_total, nivel_severidad, fecha_realizacion, ... }  (opcional)
 *   gad7,        // idem
 *   moodStats,   // { promedio_animo, total_registros }
 *   checkins,    // array últimos checkins (opcional)
 *   sessions,    // array de citas (opcional)
 *   incidents    // array de incidencias/crisis relevantes (opcional)
 * }
 */
function generateClinicalSummary(data = {}) {
    const patient = data.patient || {};
    const therapist = data.therapist || {};
    const phq9 = data.phq9 || null;
    const gad7 = data.gad7 || null;
    const moodStats = data.moodStats || {};
    const checkins = Array.isArray(data.checkins) ? data.checkins : [];
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const incidents = Array.isArray(data.incidents) ? data.incidents : [];

    const nombrePaciente = `${patient.nombre || ''} ${patient.apellido || ''}`.trim() || 'El paciente';
    const nombreTerapeuta =
        therapist.nombre_completo ||
        (therapist.nombre && therapist.apellido
            ? `${therapist.nombre} ${therapist.apellido}`
            : therapist.nombre || null);

    // -------------------------------------------------------------------
    // 1) CABECERA DEL RESUMEN
    // -------------------------------------------------------------------
    let texto = '';

    texto += `${nombrePaciente} se encuentra actualmente en seguimiento psicológico dentro de la plataforma MindCare`;
    if (nombreTerapeuta) {
        texto += `, bajo la conducción clínica de ${nombreTerapeuta}.`;
    } else {
        texto += `.`;
    }
    texto += ' El presente reporte resume la información clínica relevante reciente, integrando síntomas, evolución emocional y eventos críticos registrados.\n\n';

    // -------------------------------------------------------------------
    // 2) RESULTADOS DE ESCALAS (PHQ-9 / GAD-7)
    // -------------------------------------------------------------------
    const seccionEscalas = [];

    if (phq9) {
        const scorePHQ = Number(
            phq9.puntaje_total ??
            phq9.score ??
            phq9.total ??
            phq9.puntaje
        );

        const severidadPHQ =
            phq9.nivel_severidad ||
            classifyPHQ9(scorePHQ);

        if (!isNaN(scorePHQ)) {
            let linea = `• En la escala **PHQ-9** (síntomas depresivos) el paciente obtuvo un puntaje total de **${scorePHQ}**`;
            if (severidadPHQ) {
                linea += `, compatible con **${severidadPHQ}**.`;
            } else {
                linea += `.`;
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

        const severidadGAD =
            gad7.nivel_severidad ||
            classifyGAD7(scoreGAD);

        if (!isNaN(scoreGAD)) {
            let linea = `• En la escala **GAD-7** (ansiedad generalizada) el paciente obtuvo un puntaje total de **${scoreGAD}**`;
            if (severidadGAD) {
                linea += `, compatible con **${severidadGAD}**.`;
            } else {
                linea += `.`;
            }
            seccionEscalas.push(linea);
        }
    }

    if (seccionEscalas.length > 0) {
        texto += 'En la evaluación mediante escalas estandarizadas se observa:\n\n';
        texto += seccionEscalas.join('\n') + '\n\n';
    }

    // -------------------------------------------------------------------
    // 3) EVOLUCIÓN DEL ESTADO DE ÁNIMO / CHECKINS EMOCIONALES
    // -------------------------------------------------------------------
    const promedioAnimo = moodStats.promedio_animo != null
        ? Number(moodStats.promedio_animo)
        : null;
    const totalCheckins = moodStats.total_registros || checkins.length || 0;

    if (totalCheckins > 0 && !isNaN(promedioAnimo)) {
        let cualitativo = 'tendencia emocional neutra o moderada';
        if (promedioAnimo >= 4) {
            cualitativo = 'tendencia a un estado de ánimo positivo/estable';
        } else if (promedioAnimo <= 2) {
            cualitativo = 'tendencia a un estado de ánimo bajo o desfavorable';
        }

        texto += `En cuanto a la autoevaluación del estado de ánimo, se dispone de **${totalCheckins}** registros recientes de check-ins emocionales. El promedio de valencia reportado es de **${promedioAnimo.toFixed(1)}/5**, lo que sugiere ${cualitativo}. `;
        texto += 'La evolución debe seguirse monitoreando para identificar cambios abruptos o patrones de riesgo.\n\n';
    }

    // -------------------------------------------------------------------
    // 4) SESIONES Y ADHERENCIA
    // -------------------------------------------------------------------
    if (sessions.length > 0) {
        const sesionesCompletadas = sessions.filter(s => s.estado === 'Completada').length;
        const sesionesCanceladas = sessions.filter(s => s.estado === 'Cancelada').length;

        texto += `En el periodo analizado se registran **${sessions.length}** citas agendadas, de las cuales **${sesionesCompletadas}** han sido completadas`;
        if (sesionesCanceladas > 0) {
            texto += ` y **${sesionesCanceladas}** canceladas o reprogramadas.`;
        } else {
            texto += `.`;
        }
        texto += ' La adherencia al tratamiento se considera ';
        if (sesionesCompletadas === 0) {
            texto += 'muy baja y requiere revisión.';
        } else if (sesionesCanceladas > sesionesCompletadas) {
            texto += 'irregular, con múltiples cancelaciones que podrían afectar el proceso terapéutico.';
        } else {
            texto += 'globalmente aceptable para los objetivos terapéuticos actuales.';
        }
        texto += '\n\n';
    }

    // -------------------------------------------------------------------
    // 5) INCIDENCIAS / CRISIS RELEVANTES
    // -------------------------------------------------------------------
    if (incidents.length > 0) {
        const abiertas = incidents.filter(i =>
            (i.estado || '').toUpperCase() !== 'RESUELTO'
        );
        const criticas = incidents.filter(i => {
            const nivel = (i.nivel_gravedad || i.nivel || i.nivel_texto || '').toUpperCase();
            return nivel.includes('CRIT') || nivel === 'ALTA' || nivel === 'ALTO';
        });

        texto += 'En el registro de incidencias clínicas se han documentado **' + incidents.length + '** eventos relevantes, ';
        texto += `de los cuales **${abiertas.length}** permanecen abiertos. `;

        if (criticas.length > 0) {
            texto += 'Se identifican episodios de **alto riesgo** que requieren seguimiento cercano y coordinación con el equipo clínico. ';
        }

        texto += 'Estas incidencias están asociadas a momentos de incremento del malestar emocional y deben considerarse al ajustar el plan de intervención.\n\n';
    }

    // -------------------------------------------------------------------
    // 6) CIERRE Y PLAN DE TRATAMIENTO (GENÉRICO)
    // -------------------------------------------------------------------
    texto += 'En conjunto, el perfil clínico actual sugiere la necesidad de mantener un seguimiento terapéutico estructurado, con énfasis en:\n\n';
    texto += '• Monitorear la evolución de los síntomas depresivos y ansiosos mediante escalas estandarizadas.\n';
    texto += '• Reforzar estrategias de afrontamiento y regulación emocional adaptadas al contexto del paciente.\n';
    texto += '• Supervisar la adherencia a las sesiones y detectar oportunamente signos de descompensación.\n';
    texto += '• Activar protocolos de crisis cuando se identifiquen indicadores de riesgo elevado (ideación suicida, conductas de autoagresión o activación de botón de pánico).\n\n';

    texto += 'Este resumen tiene carácter orientativo y debe interpretarse siempre en conjunto con la historia clínica completa y el criterio profesional del terapeuta a cargo.';

    return texto;
}

module.exports = {
    generateClinicalSummary
};
