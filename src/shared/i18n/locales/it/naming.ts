import type { Messages } from '../types'

export default {
  varTitle: 'Titolo (della parte / dell’episodio)',
  varSeries: 'Titolo complessivo della raccolta, della serie o del video in più parti; vuoto per i video singoli',
  varIndex: 'Numero progressivo',
  varOwner: 'Creator',
  varOwnerMid: 'UID del creator',
  varPubdate: 'Data di pubblicazione',
  varDate: 'Data di creazione dell’attività',
  varQuality: 'Qualità',
  varCodec: 'Codec',
  varBvid: 'Codice BV',
  varAid: 'Codice av',
  varCid: 'cid',
  varEpId: 'ID dell’episodio dell’anime',
  varType: 'Tipo (video / anime, film e serie)',
  empty: 'Il modello non può essere vuoto',
  nested: 'Le sezioni facoltative <…> non possono essere annidate',
  extraClose: 'C’è un > di troppo',
  unclosed: 'Sezione facoltativa <…> non chiusa',
  /** variable è la variabile tra parentesi graffe, ad esempio {foo} */
  unknownVar: 'Variabile sconosciuta {variable}',
  unfinishedBrace: 'Parentesi graffe della variabile non chiuse'
} satisfies Messages['naming']
