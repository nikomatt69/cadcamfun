
import type { FC } from 'react';
import { useEffect, useState } from 'react';

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  useDisclosure
} from '@nextui-org/react';
import * as React from 'react';
import { BookOpen, Cpu } from 'react-feather';
import TextToCADPanel from '../ai/ai-new/TextToCADPanel';
import AIAssistantButton from '../ai/ai-new/AIAssistantButton';
import { AIHub } from '../ai/ai-new';



type Props = {
  
};

const AIModal: FC<Props> = () => {
  const [show, setShow] = useState(false);


  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();

  return (
    <div className="flex flex-col gap-1 ">
      <button type="button" onClick={onOpen}>
        <div className="px-3 py-1.5 bg-pink-50 dark:bg-pink-900 border border-pink-300 dark:border-pink-700 hover:bg-pink-100 dark:hover:bg-pink-800 text-pink-700 dark:text-pink-300 rounded-md shadow-sm flex items-center animate-pulse">
          <Cpu className="h-4 w-4" />
          <span className='text-sm px-1'>AI</span>
          
        </div>
      </button>
      <Modal
        isOpen={isOpen}
        placement={'bottom-center'}
        className='pb-9'
        backdrop="blur"
        onOpenChange={onOpenChange}
        autoFocus={false}
        motionProps={{
          variants: {
            enter: {
              y: 0,
              opacity: 1,
              transition: {
                duration: 0.3,
                ease: 'easeOut'
              }
            },
            exit: {
              y: -20,
              opacity: 0,
              transition: {
                duration: 0.2,
                ease: 'easeIn'
              }
            }
          }
        }}
      >
        <ModalContent
          autoFocus={false}
          className="h-[flex] max-h-[80vh] bg-gray-100 justify-between rounded-xl flex border  border-gray-500  dark:bg-gray-900 "
        >
          <ModalHeader autoFocus  className='justify-between g-gray-100 '>
            AI Modal
            </ModalHeader>
          <ModalBody
            autoFocus={false}
            className="max-w-xl overflow-y-auto overflow-y-hidden border-l-2 border-r-2 border-gray-300  bg-gray-100 dark:bg-gray-900"
          >
            
            <AIHub/>
           
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default AIModal;
