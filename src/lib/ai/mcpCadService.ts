import { v4 as uuidv4 } from 'uuid';
const mcpCadService = {
getSessionId: (): string => {
let sessionId = localStorage.getItem('mcpSessionId');
if (!sessionId) {
sessionId = uuidv4();
localStorage.setItem('mcpSessionId', sessionId);
}
return sessionId;
},
createNewSession: (): string => {
const newSessionId = uuidv4();
localStorage.setItem('mcpSessionId', newSessionId);
return newSessionId;
}
};
export default mcpCadService;