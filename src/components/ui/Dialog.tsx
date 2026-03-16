// src/components/ui/Dialog.tsx
// Backward compatibility - re-exports Modal
// Use Modal instead of Dialog for new code

export { Modal, ModalProps } from './Modal';

// For backward compatibility
import { Modal as DialogComponent } from './Modal';

/**
 * @deprecated Use Modal instead
 */
export const Dialog = DialogComponent;

export default DialogComponent;
