import { renderVillage } from '../../src/render/VillageScene'
import { village } from './sample-data'
import * as fs from 'fs'
const d = new Date(); d.setHours(Number(process.argv[3] || 12), 0, 0, 0)
fs.writeFileSync(process.argv[2], renderVillage(village(), { embedCss: true, date: d, idPrefix: 'sc', still: true }))
