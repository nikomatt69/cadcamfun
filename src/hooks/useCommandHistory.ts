// src/hooks/useCommandHistory.ts

import { useState, useCallback } from "react";

export interface Command {
  type: string;
  description?: string;
  undo: () => void;
  redo: () => void;

  // Specific command data
  [key: string]: any;
}

interface CommandHistoryState {
  commands: Command[];
  currentIndex: number;
}

export function useCommandHistory(maxHistory: number = 50) {
  const [state, setState] = useState<CommandHistoryState>({
    commands: [],
    currentIndex: -1
  });

  // Add a new command to history
  const addCommand = useCallback(
    (command: Command) => {
      setState(prevState => {
        // If we've gone back in history and then add a new command,
        // discard any commands after the current index
        const newCommands = prevState.commands.slice(0, prevState.currentIndex + 1);

        // Add new command and increment index
        const updatedCommands = [...newCommands, command];

        // Limit history size
        if (updatedCommands.length > maxHistory) {
          updatedCommands.shift();
        }

        return {
          commands: updatedCommands,
          currentIndex: updatedCommands.length - 1
        };
      });
    },
    [maxHistory]
  );

  // Undo the last command
  const undoCommand = useCallback(() => {
    setState(prevState => {
      if (prevState.currentIndex < 0) {
        // Nothing to undo
        return prevState;
      }

      // Execute the undo function for the current command
      const commandToUndo = prevState.commands[prevState.currentIndex];
      commandToUndo.undo();

      // Decrement the current index
      return {
        ...prevState,
        currentIndex: prevState.currentIndex - 1
      };
    });
  }, []);

  // Redo the next command
  const redoCommand = useCallback(() => {
    setState(prevState => {
      if (prevState.currentIndex >= prevState.commands.length - 1) {
        // Nothing to redo
        return prevState;
      }

      // Execute the redo function for the next command
      const commandToRedo = prevState.commands[prevState.currentIndex + 1];
      commandToRedo.redo();

      // Increment the current index
      return {
        ...prevState,
        currentIndex: prevState.currentIndex + 1
      };
    });
  }, []);

  // Clear the command history
  const clearHistory = useCallback(() => {
    setState({
      commands: [],
      currentIndex: -1
    });
  }, []);

  // Check if undo/redo are available
  const canUndo = state.currentIndex >= 0;
  const canRedo = state.currentIndex < state.commands.length - 1;

  return {
    commands: state.commands,
    currentIndex: state.currentIndex,
    addCommand,
    undoCommand,
    redoCommand,
    clearHistory,
    canUndo,
    canRedo
  };
}
