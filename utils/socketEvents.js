/**
 * Socket.IO Event Utils
 * Утилиты для отправки Socket.IO событий
 */

/**
 * Отправить событие о новом заказе
 * @param {Object} io - Socket.IO экземпляр
 * @param {Object} order - Данные заказа
 */
const emitNewOrder = (io, order) => {
  try {
    // Отправить всем подключенным клиентам
    io.emit('new_order', {
      id: order._id,
      client: order.client,
      branch: order.branch,
      products: order.products,
      totalAmount: order.totalAmount,
      paidAmount: order.paidAmount,
      debtAmount: order.debtAmount,
      paymentType: order.paymentType,
      status: order.status,
      profitAmount: order.profitAmount,
      createdAt: order.createdAt,
      notes: order.notes,
      car: order.car,
      index: order.index
    });

    // Также отправить в комнату конкретного филиала, если филиал указан
    if (order.branch) {
      io.to(`branch_${order.branch}`).emit('new_order', {
        id: order._id,
        client: order.client,
        branch: order.branch,
        products: order.products,
        totalAmount: order.totalAmount,
        paidAmount: order.paidAmount,
        debtAmount: order.debtAmount,
        paymentType: order.paymentType,
        status: order.status,
        profitAmount: order.profitAmount,
        createdAt: order.createdAt,
        notes: order.notes,
        car: order.car,
        index: order.index
      });
    }

    console.log(`Socket event 'new_order' отправлен для заказа ${order._id}`);
  } catch (error) {
    console.error('Ошибка при отправке события new_order:', error.message);
  }
};

/**
 * Отправить событие о новой услуге
 * @param {Object} io - Socket.IO экземпляр
 * @param {Object} service - Данные услуги
 */
const emitNewService = (io, service) => {
  try {
    // Отправить всем подключенным клиентам
    io.emit('new_service', {
      id: service._id,
      client: service.client,
      branch: service.branch,
      car: service.car,
      serviceType: service.serviceType,
      priority: service.priority,
      products: service.products,
      totalPrice: service.totalPrice,
      serviceIndex: service.serviceIndex,
      visitIndex: service.visitIndex,
      createdAt: service.createdAt,
      description: service.description,
      notes: service.notes
    });
    console.log(`Socket event 'new_service' отправлен для услуги ${service._id}`);
  } catch (error) {
    console.error('Ошибка при отправке события new_service:', error.message);
  }
};

/**
 * Отправить событие об обновлении заказа
 * @param {Object} io - Socket.IO экземпляр
 * @param {Object} order - Обновленные данные заказа
 */
const emitOrderUpdate = (io, order) => {
  try {
    io.emit('order_updated', {
      id: order._id,
      status: order.status,
      totalAmount: order.totalAmount,
      paidAmount: order.paidAmount,
      debtAmount: order.debtAmount,
      car: order.car,
      index: order.index,
      updatedAt: new Date()
    });

    if (order.branch) {
      io.to(`branch_${order.branch}`).emit('order_updated', {
        id: order._id,
        status: order.status,
        totalAmount: order.totalAmount,
        paidAmount: order.paidAmount,
        debtAmount: order.debtAmount,
        car: order.car,
        index: order.index,
        updatedAt: new Date()
      });
    }

    console.log(`Socket event 'order_updated' отправлен для заказа ${order._id}`);
  } catch (error) {
    console.error('Ошибка при отправке события order_updated:', error.message);
  }
};

/**
 * Отправить событие об обновлении услуги
 * @param {Object} io - Socket.IO экземпляр
 * @param {Object} service - Обновленные данные услуги
 */
const emitServiceUpdate = (io, service) => {
  try {
    io.emit('service_updated', {
      id: service._id,
      serviceType: service.serviceType,
      priority: service.priority,
      totalPrice: service.totalPrice,
      updatedAt: new Date()
    });

    if (service.branch) {
      io.to(`branch_${service.branch}`).emit('service_updated', {
        id: service._id,
        serviceType: service.serviceType,
        priority: service.priority,
        totalPrice: service.totalPrice,
        updatedAt: new Date()
      });
    }

    console.log(`Socket event 'service_updated' отправлен для услуги ${service._id}`);
  } catch (error) {
    console.error('Ошибка при отправке события service_updated:', error.message);
  }
};

module.exports = {
  emitNewOrder,
  emitNewService,
  emitOrderUpdate,
  emitServiceUpdate
};
