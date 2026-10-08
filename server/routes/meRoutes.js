import { Router } from 'express';
import { addTraveller, deleteTraveller, listTravellers, travellerSchema, updateTraveller } from '../controllers/meController.js';
import { createTicket, getMyTicket, messageSchema, myTickets, newTicketSchema, travellerReply } from '../controllers/ticketController.js';
import { requireAuth } from '../middleware/auth.js';
import { once } from '../middleware/once.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(requireAuth);
router.get('/travellers', listTravellers);
router.post('/travellers', validate(travellerSchema), addTraveller);
router.put('/travellers/:id', validate(travellerSchema), updateTraveller);
router.delete('/travellers/:id', deleteTraveller);

router.get('/tickets', myTickets);
router.post('/tickets', validate(newTicketSchema), once, createTicket);
router.get('/tickets/:id', getMyTicket);
router.post('/tickets/:id/messages', validate(messageSchema), once, travellerReply);

export default router;
