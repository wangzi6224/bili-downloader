import type { Messages } from '../types'

export default {
  exportTitle: 'Exporter la configuration',
  importTitle: 'Importer la configuration',
  exported: 'Exporté vers {path}',
  invalidJson: 'Ce fichier n’est pas un JSON valide',
  notOurs: 'Ce n’est pas un fichier de configuration exporté par cette application',
  imported: {
    one: 'Réglages et {count} abonnement importés (exportés par {app} le {date})',
    other: 'Réglages et {count} abonnements importés (exportés par {app} le {date})'
  },
  namingInvalid: 'Modèle de nom incorrect : {reason}'
} satisfies Messages['config']
