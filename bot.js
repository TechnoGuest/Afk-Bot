/* =========================
   FAKE HTTP – RAILWAY KEEP ALIVE
========================= */
const http = require('http')

const PORT = process.env.PORT || 3000
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('AFKBot alive 😎\n')
}).listen(PORT, () => {
  console.log(`[HTTP] Alive on port ${PORT}`)
})

/* =========================
   BOT
========================= */
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoalBlock, GoalXZ } = goals

const config = require('./settings.json')
const logger = require('./logging.js').logger

let reconnecting = false
let bot = null

function createBot () {
  bot = mineflayer.createBot({
    username: config['bot-account'].username,
    password: config['bot-account'].password || undefined,
    auth: config['bot-account'].type, // mojang / microsoft
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version
  })

  bot.loadPlugin(pathfinder)

  bot.once('spawn', () => {
    logger.info('✅ Bot joined server')

    const mcData = require('minecraft-data')(bot.version)
    bot.pathfinder.setMovements(new Movements(bot, mcData))
    bot.settings.colorsEnabled = false

    /* AUTO AUTH */
    if (config.utils['auto-auth']?.enabled) {
      const pass = config.utils['auto-auth'].password
      setTimeout(() => {
        bot.chat(`/login ${pass}`)
      }, 800)
    }

    /* MOVE TO POSITION */
    if (config.position?.enabled) {
      const p = config.position
      bot.pathfinder.setGoal(new GoalBlock(p.x, p.y, p.z))
    }

    /* CHAT MESSAGES */
    if (config.utils['chat-messages']?.enabled) {
      const msgs = config.utils['chat-messages'].messages || []
      if (config.utils['chat-messages'].repeat && msgs.length) {
        let i = 0
        setInterval(() => {
          bot.chat(msgs[i % msgs.length])
          i++
        }, (config.utils['chat-messages']['repeat-delay'] || 60) * 1000)
      }
    }

    /* ===== ANTI AFK (NAPRAWIONE) ===== */
    const afk = config.utils['anti-afk']
    if (afk?.enabled) {
      logger.info('🌀 Anti-AFK enabled')

      /* SNEAK */
      if (afk.sneak) {
        bot.setControlState('sneak', true)
      }

      /* JUMP – REALNY SKOK */
      if (afk.jump) {
        bot.setControlState('jump', true)
      }
          
      /* ROTATE */
      if (afk.rotate) {
        setInterval(() => {
          if (!bot.entity) return
          bot.look(bot.entity.yaw + 0.5, bot.entity.pitch, true)
        }, 200)
      }

      /* CIRCLE WALK */
      if (afk['circle-walk']?.enabled) {
        startCircleWalk(bot, afk['circle-walk'].radius || 2)
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
  bot.on('kicked', reason => {
    let msg = 'Unknown reason'
    try {
      if (typeof reason === 'string') msg = reason
      else if (reason?.text) msg = reason.text
      else msg = JSON.stringify(reason)
    } catch {}
    msg = msg.replace(/§./g, '').replace(/\n/g, ' ')
    logger.warn(`❌ Kicked: ${msg}`)
  })

  /* SAFE ERROR */
  bot.on('error', err => {
    logger.error(err?.message || err)
  })

  /* AUTO RECONNECT (ANTI DUPLICATE LOGIN) */
  bot.on('end', () => {
    if (!config.utils['auto-reconnect']) return
    if (reconnecting) return

    reconnecting = true
    logger.warn('🔁 Disconnected, reconnecting in 10s...')

    setTimeout(() => {
      reconnecting = false
      createBot()
    }, Math.max(config.utils['auto-reconnect-delay'] || 5000, 10000))
  })
}

/* ===== CIRCLE WALK (STABILNE) ===== */
function startCircleWalk (bot, r) {
  const base = bot.entity.position.clone()
  const points = [
    [base.x + r, base.z],
    [base.x, base.z + r],
    [base.x - r, base.z],
    [base.x, base.z - r]
  ]
  let i = 0

  setInterval(() => {
    if (!bot.entity) return
    bot.pathfinder.setGoal(new GoalXZ(points[i][0], points[i][1]))
    i = (i + 1) % points.length
  }, 3000)
}

/* GLOBAL ANTI-CRASH */
process.on('uncaughtException', e =>
  logger.error('[UNCAUGHT]', e.message)
)
process.on('unhandledRejection', e =>
  logger.error('[UNHANDLED]', e)
)

createBot()

