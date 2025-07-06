import { useCADStore } from "@/src/store/cadStore";

const OriginControls: React.FC = () => {
  const { originOffset, setOriginOffset, resetOrigin, setOriginPreset } = useCADStore();

  return (
    <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-md">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Origin Position</h3>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400">X</label>
          <input
            type="number"
            value={originOffset.x}
            onChange={e => {
              const newX = parseFloat(e.target.value) || 0;
              setOriginOffset({ ...originOffset, x: newX });
            }}
            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400">Y</label>
          <input
            type="number"
            value={originOffset.y}
            onChange={e => {
              const newY = parseFloat(e.target.value) || 0;
              setOriginOffset({ ...originOffset, y: newY });
            }}
            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400">Z</label>
          <input
            type="number"
            value={originOffset.z}
            onChange={e => {
              const newZ = parseFloat(e.target.value) || 0;
              setOriginOffset({ ...originOffset, z: newZ });
            }}
            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
          />
        </div>
      </div>

      <div className="mb-2">
        <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Origin Preset</h4>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => setOriginPreset("center")}
            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Center
          </button>
          <button
            onClick={() => setOriginPreset("bottomLeft")}
            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Bottom Left
          </button>
          <button
            onClick={() => setOriginPreset("topRight")}
            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Top Right
          </button>
          <button
            onClick={() => setOriginPreset("topLeft")}
            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Top Left
          </button>
        </div>
      </div>

      <button
        onClick={resetOrigin}
        className="w-full px-3 py-1 mt-2 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/70"
      >
        Reset Origin (0,0,0)
      </button>
    </div>
  );
};
export default OriginControls;
