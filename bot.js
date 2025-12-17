/* =========================
    FAKE HTTP – KEEP ALIVE
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
let useItemInterval = null
let walkInterval = null
let pardonInterval = null
let chatInterval = null

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

    /* =========================
        AUTO AUTH
    ========================= */
    if (config.utils['auto-auth']?.enabled) {
      setTimeout(() => {
        bot.chat(`/login ${config.utils['auto-auth'].password}`)
        logger.info('🔐 Sent /login')
      }, 1500)
    }

    /* =========================
        CHAT MESSAGES (FIX)
    ========================= */
    const chatCfg = config.utils['chat-messages']

    if (chatCfg?.enabled && Array.isArray(chatCfg.messages)) {
      let index = 0
      const delay = (chatCfg['repeat-delay'] || 60) * 1000

      setTimeout(() => {
        logger.info('💬 Chat-messages enabled')

        const sendMessage = () => {
          const msg = chatCfg.messages[index]
          if (!msg) return

          bot.chat(msg)
          logger.info(`📨 Sent: ${msg}`)

          index = (index + 1) % chatCfg.messages.length
        }

        sendMessage()

        if (chatCfg.repeat) {
          chatInterval = setInterval(sendMessage, delay)
        }
      }, 4000) // WAŻNE: delay po spawnie + loginie
    }

    /* =========================
        MOVE TO POSITION
    ========================= */
    if (config.position?.enabled) {
      const p = config.position
      bot.pathfinder.setGoal(new GoalBlock(p.x, p.y, p.z))

      setTimeout(() => {
        bot.pathfinder.stop()
        bot.clearControlStates()
        logger.info('🛑 Pathfinder OFF')
        startAntiAfk()
      }, 5000)
    } else {
      startAntiAfk()
    }
  })

  /* =========================
      ANTI AFK + WATCHDOG
  ========================= */
  function startAntiAfk () {
    const afk = config.utils['anti-afk']
    if (!afk?.enabled) return

    logger.info('🌀 Anti-AFK enabled')
    bot.clearControlStates()

    /* WALK */
    if (afk.walk) {
      let forward = true
      bot.setControlState('forward', true)

      walkInterval = setInterval(() => {
        bot.setControlState('forward', forward)
        bot.setControlState('back', !forward)
        forward = !forward
      }, 2000)
    }

    /* JUMP */
    if (afk.jump) {
      jumpInterval = setInterval(() => {
        bot.setControlState('jump', true)
        setTimeout(() => bot.setControlState('jump', false), 200)
      }, 2500)
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

    /* =========================
        WATCHDOG – /pardon
    ========================= */
    if (afk.watchAfkBot?.enabled) {
      const target = afk.watchAfkBot.username || 'AFKBot'
      const interval = afk.watchAfkBot.checkInterval || 15000
      let lastPardon = 0

      logger.info(`👀 Watchdog ON – pilnuję: ${target}`)

      pardonInterval = setInterval(() => {
        if (!bot.players) return

        const online = Object.keys(bot.players)
        const now = Date.now()

        if (!online.includes(target) && now - lastPardon > interval) {
          logger.warn(`⚠️ ${target} offline – wysyłam /pardon`)
          bot.chat(`/pardon ${target}`)
          lastPardon = now
        }
      }, interval)
    }
  }

  /* =========================
      CLEANUP
  ========================= */
  function stopAntiAfk () {
    clearInterval(jumpInterval)
    clearInterval(rotateInterval)
    clearInterval(useItemInterval)
    clearInterval(walkInterval)
    clearInterval(pardonInterval)
    clearInterval(chatInterval)
    bot?.clearControlStates()
  }

  /* =========================
      LOGI
  ========================= */
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
    }, config.utils['auto-reconnect-delay'] || 10000)
  })
}

createBot()
