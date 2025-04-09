// src/plugins/core/messaging/message-serializer.ts

/**
 * Types of values that can be serialized
 */
export type SerializableValue =
  | null
  | undefined
  | boolean
  | number
  | string
  | SerializableArray
  | SerializableObject
  | Date
  | Error
  | Map<SerializableValue, SerializableValue>
  | Set<SerializableValue>
  | ArrayBuffer
  | Uint8Array;

export interface SerializableArray extends Array<SerializableValue> {}
export interface SerializableObject { [key: string]: SerializableValue }

/**
 * Special token types for the serializer
 */
enum TokenType {
  DATE = '__DATE__',
  ERROR = '__ERROR__',
  UNDEFINED = '__UNDEFINED__',
  REGEXP = '__REGEXP__',
  MAP = '__MAP__',
  SET = '__SET__',
  ARRAY_BUFFER = '__ARRAY_BUFFER__',
  TYPED_ARRAY = '__TYPED_ARRAY__',
  FUNCTION_REF = '__FUNCTION_REF__',
  CIRCULAR_REF = '__CIRCULAR_REF__',
}

/**
 * Options for serialization
 */
export interface SerializerOptions {
  /**
   * Maximum depth to serialize (to prevent stack overflow)
   */
  maxDepth?: number;
  
  /**
   * Whether to detect and handle circular references
   */
  handleCircularReferences?: boolean;
  
  /**
   * Whether to preserve function references (as strings)
   */
  preserveFunctionReferences?: boolean;
  
  /**
   * Whether to throw on unsupported types
   */
  strictMode?: boolean;
}

/**
 * Handles serialization and deserialization of complex objects for safe communication
 * between host and plugins. Supports handling circular references, special JS types,
 * and prevents prototype pollution.
 */
export class MessageSerializer {
  private options: Required<SerializerOptions>;
  
  constructor(options?: SerializerOptions) {
    this.options = {
      maxDepth: 100,
      handleCircularReferences: true,
      preserveFunctionReferences: false,
      strictMode: true,
      ...options
    };
  }
  
  /**
   * Serialize a value to a format safe for postMessage
   */
  public serialize(value: SerializableValue): string {
    // Track objects for circular reference detection
    const seen = new WeakMap<object, number>();
    let nextId = 1;
    
    const replacer = (key: string, value: any, depth = 0): any => {
      // Check for maximum recursion depth
      if (depth > this.options.maxDepth) {
        if (this.options.strictMode) {
          throw new Error(`Maximum serialization depth exceeded (${this.options.maxDepth})`);
        }
        return null;
      }
      
      // Handle primitives and null directly
      if (value === null || typeof value !== 'object' && typeof value !== 'function') {
        // Special case for undefined
        if (value === undefined) {
          return { __type: TokenType.UNDEFINED };
        }
        return value;
      }
      
      // Handle circular references
      if (this.options.handleCircularReferences && typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return { __type: TokenType.CIRCULAR_REF, id: seen.get(value) };
        }
        
        // Track this object
        seen.set(value, nextId++);
      }
      
      // Handle special object types
      if (value instanceof Date) {
        return { __type: TokenType.DATE, value: value.toISOString() };
      }
      
      if (value instanceof Error) {
        return {
          __type: TokenType.ERROR,
          name: value.name,
          message: value.message,
          stack: value.stack,
          // Include additional properties
          ...Object.getOwnPropertyNames(value)
            .filter(prop => prop !== 'name' && prop !== 'message' && prop !== 'stack')
            .reduce((obj, prop) => {
              obj[prop] = (value as any)[prop];
              return obj;
            }, {} as Record<string, any>)
        };
      }
      
      if (value instanceof RegExp) {
        return {
          __type: TokenType.REGEXP,
          source: value.source,
          flags: value.flags
        };
      }
      
      if (value instanceof Map) {
        // Convert Map to array of key-value pairs
        const entries = Array.from(value.entries());
        return {
          __type: TokenType.MAP,
          entries: entries.map(([k, v]) => [
            replacer('key', k, depth + 1),
            replacer('value', v, depth + 1)
          ])
        };
      }
      
      if (value instanceof Set) {
        // Convert Set to array
        const values = Array.from(value.values());
        return {
          __type: TokenType.SET,
          values: values.map(v => replacer('value', v, depth + 1))
        };
      }
      
      if (value instanceof ArrayBuffer) {
        return {
          __type: TokenType.ARRAY_BUFFER,
          // Convert ArrayBuffer to Base64 string without using spread operator to avoid downlevel iteration issues
          base64: (() => {
              const bytes = new Uint8Array(value);
              let binary = '';
              for (let i = 0; i < bytes.length; i++) {
                  binary += String.fromCharCode(bytes[i]);
              }
              return btoa(binary);
          })()
        };
      }
      
      if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
        // Handle typed arrays (Uint8Array, etc.)
        const typedArray = value as Uint8Array;
        return {
          __type: TokenType.TYPED_ARRAY,
          name: value.constructor.name,
          base64: btoa(String.fromCharCode.apply(null, 
            Array.from(
              value instanceof Uint8Array
                ? value
                : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
            )
          ) )
        };
      }
      
      if (typeof value === 'function' && this.options.preserveFunctionReferences) {
        return {
          __type: TokenType.FUNCTION_REF,
          name: value.name || '(anonymous)',
          toString: value.toString()
        };
      }
      
      // Handle arrays recursively
      if (Array.isArray(value)) {
        return value.map((item, index) => replacer(String(index), item, depth + 1));
      }
      
      // Handle objects recursively
      if (typeof value === 'object') {
        const result: Record<string, any> = {};
        
        for (const prop of Object.keys(value)) {
          result[prop] = replacer(prop, value[prop], depth + 1);
        }
        
        return result;
      }
      
      // Unsupported type
      if (this.options.strictMode) {
        throw new Error(`Cannot serialize value of type: ${typeof value}`);
      }
      
      return null;
    };
    
    try {
      // Use a custom replacer to handle special types
      return JSON.stringify(value, (key, value) => replacer(key, value));
    } catch (error) {
      console.error('Serialization error:', error);
      throw new Error(`Failed to serialize message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Deserialize a value from a postMessage-safe format
   */
  public deserialize(serialized: string): any {
    // Tracking restored circular references
    const restored = new Map<number, any>();
    
    const reviver = (key: string, value: any): any => {
      // Handle non-objects directly
      if (value === null || typeof value !== 'object') {
        return value;
      }
      
      // Check for special token types
      if (value.__type) {
        switch (value.__type) {
          case TokenType.DATE:
            return new Date(value.value);
            
          case TokenType.ERROR:
            const error = new Error(value.message);
            error.name = value.name;
            error.stack = value.stack;
            
            // Add any additional properties
            Object.keys(value).forEach(prop => {
              if (prop !== '__type' && prop !== 'name' && prop !== 'message' && prop !== 'stack') {
                (error as any)[prop] = value[prop];
              }
            });
            
            return error;
            
          case TokenType.UNDEFINED:
            return undefined;
            
          case TokenType.REGEXP:
            return new RegExp(value.source, value.flags);
            
          case TokenType.MAP:
            const map = new Map();
            value.entries.forEach(([k, v]: [any, any]) => {
              map.set(k, v);
            });
            return map;
            
          case TokenType.SET:
            const set = new Set();
            value.values.forEach((v: any) => {
              set.add(v);
            });
            return set;
            
          case TokenType.ARRAY_BUFFER:
            // Decode base64 string to ArrayBuffer
            const binary = atob(value.base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            return bytes.buffer;
            
          case TokenType.TYPED_ARRAY:
            // Decode base64 string to typed array
            const binaryStr = atob(value.base64);
            const uint8Array = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              uint8Array[i] = binaryStr.charCodeAt(i);
            }
            
            // Create the appropriate typed array
            switch (value.name) {
              case 'Uint8Array': return uint8Array;
              case 'Uint16Array': return new Uint16Array(uint8Array.buffer);
              case 'Uint32Array': return new Uint32Array(uint8Array.buffer);
              case 'Int8Array': return new Int8Array(uint8Array.buffer);
              case 'Int16Array': return new Int16Array(uint8Array.buffer);
              case 'Int32Array': return new Int32Array(uint8Array.buffer);
              case 'Float32Array': return new Float32Array(uint8Array.buffer);
              case 'Float64Array': return new Float64Array(uint8Array.buffer);
              default: return uint8Array;
            }
            
          case TokenType.FUNCTION_REF:
            // Functions can't be deserialized, return a placeholder
            const placeholderFn = () => {
              throw new Error(`Cannot call deserialized function "${value.name}". Function references are not executable.`);
            };
            placeholderFn.toString = () => value.toString;
            placeholderFn.__isDeserializedFunctionRef = true;
            return placeholderFn;
            
          case TokenType.CIRCULAR_REF:
            // Return the already restored object
            if (restored.has(value.id)) {
              return restored.get(value.id);
            }
            // Should never happen with properly serialized data
            throw new Error(`Circular reference with ID ${value.id} not found`);
        }
      }
      
      // Handle circular references during construction
      if (this.options.handleCircularReferences && value.__circularId) {
        const id = value.__circularId;
        // Remove the ID property to keep the object clean
        delete value.__circularId;
        // Store the object for later references
        restored.set(id, value);
      }
      
      return value;
    };
    
    try {
      // Use a custom reviver to handle special types
      return JSON.parse(serialized, reviver);
    } catch (error) {
      console.error('Deserialization error:', error);
      throw new Error(`Failed to deserialize message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}