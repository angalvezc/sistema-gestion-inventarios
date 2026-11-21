// Conexión a RabbitMQ con reconexión automática (RNF08, RNF09).
// Si el broker no está disponible, el servicio sigue atendiendo REST y reintenta cada
// pocos segundos; al reconectar vuelve a declarar el exchange y los consumidores.
const amqp = require('amqplib');

class RabbitMQConnection {
  constructor({ url, exchange, reconnectDelayMs = 5000, onConnected = async () => {} }) {
    this.url = url;
    this.exchange = exchange;
    this.reconnectDelayMs = reconnectDelayMs;
    this.onConnected = onConnected;
    this.connection = null;
    this.publishChannel = null;
    this.reconnectTimer = null;
    this.stopped = false;
  }

  start() {
    this.#connect();
  }

  isConnected() {
    return this.publishChannel !== null;
  }

  // Publica varios mensajes y espera la confirmación del broker (publisher confirms):
  // si esta promesa termina sin error, RabbitMQ ya guardó todos los mensajes.
  async publishBatch(messages) {
    const channel = this.publishChannel;
    if (!channel) throw new Error('RabbitMQ no está conectado');
    for (const { routingKey, messageId, body } of messages) {
      channel.publish(this.exchange, routingKey, Buffer.from(JSON.stringify(body)), {
        persistent: true, // el mensaje sobrevive a un reinicio del broker
        contentType: 'application/json',
        messageId,
        type: routingKey,
      });
    }
    await channel.waitForConfirms();
  }

  async close() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    if (this.connection) await this.connection.close().catch(() => {});
  }

  async #connect() {
    if (this.stopped) return;
    let connection;
    try {
      connection = await amqp.connect(this.url);
      connection.on('error', (err) => console.warn(`[rabbitmq] Error de conexión: ${err.message}`));
      connection.on('close', () => {
        this.connection = null;
        this.publishChannel = null;
        if (!this.stopped) {
          console.warn('[rabbitmq] Conexión cerrada; se reintentará');
          this.#scheduleReconnect();
        }
      });

      const channel = await connection.createConfirmChannel();
      await channel.assertExchange(this.exchange, 'topic', { durable: true });
      this.connection = connection;
      this.publishChannel = channel;
      await this.onConnected(connection);
      console.log(`[rabbitmq] Conectado; exchange "${this.exchange}" listo`);
    } catch (err) {
      console.warn(`[rabbitmq] No disponible (${err.message}); reintento en ${this.reconnectDelayMs / 1000} s`);
      this.publishChannel = null;
      if (connection) await connection.close().catch(() => {});
      this.#scheduleReconnect();
    }
  }

  #scheduleReconnect() {
    if (this.reconnectTimer || this.stopped) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.#connect();
    }, this.reconnectDelayMs);
  }
}

module.exports = { RabbitMQConnection };
