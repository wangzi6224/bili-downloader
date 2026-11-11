import type { Messages } from '../types'

// MCP 批次状态里给 AI 的下一步提示
export default {
  expanding:
    'Récupération des parties des vidéos et ajout progressif à la file ({done}/{total}) ; les éléments déjà ajoutés commencent à se télécharger. Vous pouvez attendre avec wait_seconds',
  interruptedError: {
    one: 'Erreur lors de la récupération des parties des vidéos ({error}) : arrêté, {count} élément n’a pas encore été ajouté à la file ; appelez control_tasks action=resume batch_id={id} un peu plus tard pour continuer',
    other: 'Erreur lors de la récupération des parties des vidéos ({error}) : arrêté, {count} éléments n’ont pas encore été ajoutés à la file ; appelez control_tasks action=resume batch_id={id} un peu plus tard pour continuer'
  },
  interruptedQuit: {
    one: 'À la fermeture de l’application, {count} élément n’avait pas encore été ajouté à la file ; appelez control_tasks action=resume batch_id={id} pour continuer',
    other: 'À la fermeture de l’application, {count} éléments n’avaient pas encore été ajoutés à la file ; appelez control_tasks action=resume batch_id={id} pour continuer'
  },
  waitingAuth: 'La connexion a expiré ; le téléchargement reprendra automatiquement après reconnexion. {loginHint}',
  retrying: {
    one: 'Téléchargement en cours ; {count} tâche en erreur attend une nouvelle tentative automatique. Vous pouvez attendre avec wait_seconds',
    other: 'Téléchargement en cours ; {count} tâches en erreur attendent une nouvelle tentative automatique. Vous pouvez attendre avec wait_seconds'
  },
  downloading: 'Téléchargement en cours, vous pouvez attendre avec wait_seconds',
  paused: {
    one: '{count} tâche est en pause (les tâches inachevées sont mises en pause automatiquement au redémarrage de l’application) ; appelez control_tasks action=resume batch_id={id} pour continuer',
    other: '{count} tâches sont en pause (les tâches inachevées sont mises en pause automatiquement au redémarrage de l’application) ; appelez control_tasks action=resume batch_id={id} pour continuer'
  },
  retryFailed: 'Appelez control_tasks action=retry batch_id={id} pour réessayer les échecs',
  unsupported:
    'Les tâches impossibles à télécharger (unsupported) nécessitent le plus souvent Bilibili Premium, sont soumises à une restriction géographique ou sont payantes ; réessayer ne sert à rien',
  allDownloaded: 'Tous les éléments sélectionnés ont déjà été téléchargés'
} satisfies Messages['mcpBatch']
