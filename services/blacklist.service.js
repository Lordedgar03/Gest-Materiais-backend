// services/blacklist.service.js
"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");           // instancia do Sequelize
const TokenBlacklist = require("../models/tokenBlacklist.model");
const { Op } = require("sequelize");
const cron = require("node-cron");

/** Converte vários formatos para Date válida */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

module.exports = {
  name: "blacklist",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize),
  model: TokenBlacklist,

  actions: {
    /**
     * Adiciona um token ao blacklist (idempotente).
     * params.token      — string
     * params.expiresAt  — ISO | number (ms) | Date
     */
    add: {
      rest: false,
      params: {
        token: { type: "string", empty: false, trim: true },
        expiresAt: { type: "any" }
      },
      async handler(ctx) {
        const { token, expiresAt } = ctx.params;
        const exp = toDate(expiresAt);
        if (!exp) throw new Error("expiresAt inválido.");

        // já expirado? não insere
        if (exp.getTime() <= Date.now()) {
          return { skipped: true, reason: "already_expired" };
        }

        // evita duplicação e mantém o maior prazo
        const [row, created] = await this.adapter.model.findOrCreate({
          where: { token },
          defaults: { token, expires_at: exp }
        });

        if (!created) {
          const currentExp = toDate(row.expires_at);
          if (!currentExp || currentExp.getTime() < exp.getTime()) {
            await this.adapter.model.update({ expires_at: exp }, { where: { token } });
          }
        }

        return { success: true, created, token, expiresAt: exp.toISOString() };
      }
    },

    /**
     * Verifica se um token está no blacklist (ainda válido).
     * true => bloqueado; false => não bloqueado (ou expirado/limpo).
     */
    check: {
      rest: false,
      params: { token: { type: "string", empty: false, trim: true } },
      async handler(ctx) {
        const { token } = ctx.params;
        const row = await this.adapter.model.findOne({ where: { token } });
        if (!row) return false;

        const exp = new Date(row.expires_at);
        if (!exp || exp.getTime() <= Date.now()) {
          await this.adapter.model.destroy({ where: { token } });
          return false; // expirado -> limpa e retorna false
        }
        return true; // ainda na blacklist -> bloqueia
      }
    },

    /**
     * Purga todos os tokens expirados (uso manual e pelo cron diário).
     * Obs: usamos NOW() do banco p/ evitar divergência de relógio do Node.
     */
    purgeExpired: {
      rest: "POST /blacklist/purge",
      async handler() {
        const deleted = await this.adapter.model.destroy({
          where: { expires_at: { [Op.lte]: sequelize.fn("NOW") } }
        });
        return { deleted };
      }
    },

    /** (opcional) Limpa toda a tabela — uso administrativo */
    truncateAll: {
      rest: false,
      async handler() {
        await this.adapter.model.destroy({ where: {} });
        return { success: true };
      }
    }
  },

  /**
   * Agenda: todos os dias às 01:00 no fuso horário de São Tomé e Príncipe,
   * removendo apenas tokens expirados.
   */
  async started() {
    const tz = process.env.BLACKLIST_CLEAN_TZ || "Africa/Sao_Tome";

    // “0 1 * * *” → 01:00 todos os dias no TZ indicado
    this.cleanJob = cron.schedule(
      "0 1 * * *",
      async () => {
        try {
          const res = await this.broker.call("blacklist.purgeExpired");
          this.logger.info(`[blacklist] purgeExpired diário: apagados=${res.deleted}`);
        } catch (err) {
          this.logger.error("[blacklist] purgeExpired falhou:", err?.message || err);
        }
      },
      { timezone: tz }
    );

    this.logger.info(`[blacklist] cron diário configurado para 01:00 (${tz}) — purge de expirados.`);
  },

  async stopped() {
    if (this.cleanJob) this.cleanJob.stop();
  }
};
