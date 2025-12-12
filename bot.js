/* =========================
   FAKE HTTP – RAILWAY KEEP ALIVE
========================= */
const http = require('http')

const PORT = process.env.PORT || 3000
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('AFKBot alive 😎\n')
}).listen(PORT)

/* =========================
   BOT
========================= */
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoalBlock } = goals

const config = require('./settings.json')
const logger = require('./logging.js').logger

let bot
let reconnecting = false
let jumpInterval = null
let rotateInterval = null

function createBot () {
  bot = mineflayer.createBot({
    username: config['bot-account'].username,
    password: config['bot-account'].password || undefined,
    auth: config['bot-account'].type,
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version
  })

  bot.loadPlugin(pathfinder)

  bot.once('spawn', () => {
    logger.info('✅ Bot joined server')

    const mcData = require('minecraft-data')(bot.version)
    bot.pathfinder.setMovements(new Movements(bot, mcData))

    /* AUTO AUTH */
    if (config.utils['auto-auth']?.enabled) {
      setTimeout(() => {
        bot.chat(`/login ${config.utils['auto-auth'].password}`)
      }, 800)
    }

    /* MOVE TO POSITION (JEDNORAZOWO) */
    if (config.position?.enabled) {
      const p = config.position
      bot.pathfinder.setGoal(new GoalBlock(p.x, p.y, p.z))

      setTimeout(() => {
        bot.pathfinder.stop()
        bot.clearControlStates() // 🔥 SPRZĄTANIE PO PATHFINDERZE
        logger.info('🛑 Pathfinder OFF')
        startAntiAfk()
      }, 5000)
    } else {
      startAntiAfk()
    }
  })

  /* =========================
     ANTI AFK – STABLE MODE
  ========================= */
  function startAntiAfk () {
    const afk = config.utils['anti-afk']
    if (!afk?.enabled) return

    logger.info('🌀 Anti-AFK enabled')

    bot.clearControlStates()

    /* WALK */
    if (afk.walk) {
      bot.setControlState('forward', true)
    }

    /* JUMP – HUMAN MODE */
    if (afk.jump) {
      jumpInterval = setInterval(() => {
        bot.setControlState('jump', true)
        setTimeout(() => {
          bot.setControlState('jump', false)
        }, 200)
      }, 2000)
    }

    /* ROTATE */
    if (afk.rotate) {
      rotateInterval = setInterval(() => {
        if (!bot.entity) return
        bot.look(
          bot.entity.yaw + (Math.random() - 0.5),
          bot.entity.pitch,
          true
        )
      }, 1500)
    }
  }

  /* =========================
     CLEANUP
  ========================= */
  function stopAntiAfk () {
    if (jumpInterval) clearInterval(jumpInterval)
    if (rotateInterval) clearInterval(rotateInterval)
    bot?.clearControlStates()
  }

  /* LOGI */
  bot.on('chat', (u, m) => {
    if (config.utils['chat-log']) {
      logger.info(`<${u}> ${m}`)
    }
  })

  bot.on('kicked', r => {
    logger.warn('❌ Kicked:', r?.text || r)
  })

  bot.on('error', e => logger.error(e))

  bot.on('end', () => {
    stopAntiAfk()
    if (!config.utils['auto-reconnect'] || reconnecting) return
    reconnecting = true
    setTimeout(() => {
      reconnecting = false
      createBot()
    }, 10000)
  })
}

createBot()
