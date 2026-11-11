import type { Messages } from '../types'

export default {
  varTitle: 'Titre (titre de la partie / de l’épisode)',
  varSeries: 'Titre global de la collection, de la série ou de la vidéo en plusieurs parties ; vide pour une vidéo seule',
  varIndex: 'Numéro',
  varOwner: 'Créateur',
  varOwnerMid: 'UID du créateur',
  varPubdate: 'Date de publication',
  varDate: 'Date de création de la tâche',
  varQuality: 'Qualité',
  varCodec: 'Codec',
  varBvid: 'Identifiant BV',
  varAid: 'Identifiant av',
  varCid: 'cid',
  varEpId: 'ID de l’épisode d’anime',
  varType: 'Type (vidéo / anime, films et séries)',
  empty: 'Le modèle ne peut pas être vide',
  nested: 'Les sections facultatives <…> ne peuvent pas être imbriquées',
  extraClose: 'Un > en trop',
  unclosed: 'Section facultative <…> non fermée',
  /** variable 是带花括号的变量，例如 {foo} */
  unknownVar: 'Variable inconnue {variable}',
  unfinishedBrace: 'Accolade de variable non fermée'
} satisfies Messages['naming']
