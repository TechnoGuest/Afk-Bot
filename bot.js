/* =========================
   FAKE HTTP – RAILWAY BAIT
========================= */
const http = require('http')

const PORT = process.env.PORT || 3000
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('AFKBot alive 😎\n')
}).listen(PORT, () => {
  console.log(`[HTTP] Fake server running on port ${PORT}`)
})

/* =========================
   BOT
========================= */
const mineflayer = require('mineflayer')
const { Movements, pathfinder, goals } = require('mineflayer-pathfinder')
const { GoalBlock, GoalXZ } = goals

const config = require('./settings.json')
const loggers = require('./logging.js')
const logger = loggers.logger

let reconnecting = false

function createBot () {
  const bot = mineflayer.createBot({
    username: config['bot-account'].username,
    password: config['bot-account'].password || undefined,
    auth: config['bot-account'].type,
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version
  })

  bot.loadPlugin(pathfinder)

  bot.once('spawn', () => {
    logger.info('Bot joined the server')

    const mcData = require('minecraft-data')(bot.version)
    bot.pathfinder.setMovements(new Movements(bot, mcData))
    bot.settings.colorsEnabled = false

    /* AUTO AUTH */
    if (config.utils['auto-auth']?.enabled) {
      const pass = config.utils['auto-auth'].password
      setTimeout(() => {
        bot.chat(`/register ${pass} ${pass}`)
        bot.chat(`/login ${pass}`)
      }, 500)
    }

    /* CHAT MESSAGES */
    if (config.utils['chat-messages']?.enabled) {
      const msgs = config.utils['chat-messages'].messages || []
      if (config.utils['chat-messages'].repeat) {
        let i = 0
        setInterval(() => {
          if (msgs.length) bot.chat(msgs[i++ % msgs.length])
        }, (config.utils['chat-messages']['repeat-delay'] || 60) * 1000)
      } else {
        msgs.forEach(m => bot.chat(m))
      }
    }

    /* MOVE TO POSITION */
    if (config.position?.enabled) {
      const p = config.position
      bot.pathfinder.setGoal(new GoalBlock(p.x, p.y, p.z))
    }

    /* ANTI AFK */
    const afk = config.utils['anti-afk']
    if (afk?.enabled) {
      if (afk.sneak) bot.setControlState('sneak', true)
      if (afk.jump) bot.setControlState('jump', true)

      if (afk.rotate) {
        setInterval(() => {
          if (bot.entity) bot.look(bot.entity.yaw + 1, bot.entity.pitch, true)
        }, 100)
      }

      if (afk['circle-walk']?.enabled) {
        circleWalk(bot, afk['circle-walk'].radius || 2)
      }
    }
  })

  /* CHAT LOG */
  bot.on('chat', (u, m) => {
    if (config.utils['chat-log']) {
      logger.info(`<${u}> ${m}`)
    }
  })

  /* SAFE KICK */
  bot.on('kicked', (reason) => {
    let msg = 'Unknown reason'
    try {
      if (typeof reason === 'string') msg = reason
      else if (reason?.text) msg = reason.text
      else msg = JSON.stringify(reason)
    } catch {}
    msg = String(msg).replace(/§./g, '').replace(/\n/g, ' ')
    logger.warn(`Bot kicked: ${msg}`)
  })

  /* SAFE ERROR */
  bot.on('error', err => {
    logger.error(err?.message || err)
  })

  /* AUTO RECONNECT */
  bot.on('end', () => {
    if (!config.utils['auto-reconnect']) return
    if (reconnecting) return

    reconnecting = true
    logger.warn('Disconnected, reconnecting...')

    setTimeout(() => {
      reconnecting = false
      createBot()
    }, config.utils['auto-reconnect-delay'] || 5000)
  })
}

/* CIRCLE WALK */
function circleWalk (bot, r) {
  const p = bot.entity.position
  const pts = [
    [p.x + r, p.z],
    [p.x, p.z + r],
    [p.x - r, p.z],
    [p.x, p.z - r]
  ]
  let i = 0

  setInterval(() => {
    if (!bot.entity) return
    bot.pathfinder.setGoal(new GoalXZ(pts[i][0], pts[i][1]))
    i = (i + 1) % pts.length
  }, 1000)
}

/* GLOBAL ANTI-CRASH */
process.on('uncaughtException', e =>
  logger.error('[UNCAUGHT]', e.message)
)
process.on('unhandledRejection', e =>
  logger.error('[UNHANDLED]', e)
)

createBot()

