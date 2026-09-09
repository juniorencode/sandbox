import PropTypes from 'prop-types';
import { GoPlus } from 'react-icons/go';
import { IoClose } from 'react-icons/io5';
import './TabBar.css';

export const TabBar = ({ tabs, activeTab, setTabs, setActiveTab }) => {
  const addTab = () => {
    const usedIds = tabs.map(tab => tab.id);
    let newId = 1;

    while (usedIds.includes(newId)) newId++;

    const newTab = {
      id: newId,
      name: `Tab ${newId}`,
      code: ''
    };

    setTabs(prevTabs => [...prevTabs, newTab]);
    setActiveTab(newTab.id);
  };

  const removeTab = id => {
    if (tabs.length <= 1) return;
    const newTabs = tabs.filter(tab => tab.id !== id);
    setTabs(newTabs);
    if (activeTab === id) {
      setActiveTab(newTabs[0].id);
    }
  };

  // Re-running is the runner's job: it reacts to the active tab changing, so
  // switching no longer has to push code into the worker by hand.
  const switchTab = id => setActiveTab(id);

  // Guarded because `window.api` only exists behind the Electron preload; in
  // `npm run dev` the app runs in a plain browser tab and these are no-ops.
  const handleClose = () => window.api?.closeWindow();
  const handleMinimize = () => window.api?.minimizeWindow();
  const handleMaximize = () => window.api?.maximizeWindow();

  return (
    <div className="drag-bar flex gap-1 px-2 select-none bg-[#14181f]">
      <div className="flex gap-2 items-center justify-center px-1">
        <button
          className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600"
          title="Close"
          aria-label="Close window"
          onClick={handleClose}
        ></button>
        <button
          className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600"
          title="Minimize"
          aria-label="Minimize window"
          onClick={handleMinimize}
        ></button>
        <button
          className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600"
          title="Maximize"
          aria-label="Maximize window"
          onClick={handleMaximize}
        ></button>
      </div>
      <div
        className="flex items-center justify-center ml-[10px] w-[20px] bg-no-repeat bg-contain bg-center"
        style={{
          backgroundImage: `url('favicon.png')`
        }}
      ></div>
      <div className="flex flex-nowrap px-3 h-[40px] whitespace-nowrap overflow-x-auto scrollbar-hidden overflow-y-hidden text-neutral-600">
        {tabs.map(tab =>
          activeTab === tab.id ? (
            <div
              key={tab.id}
              className="indicator group relative flex items-center justify-center gap-2 pl-4 pr-3 rounded-t-[10px] text-neutral-300 bg-[#212830]"
            >
              <div>{tab.name}</div>
              <button
                className="flex items-center justify-center mt-0.5 w-4 h-4 rounded-full hover:bg-[#464d5a]"
                title="Close tab"
                aria-label={`Close ${tab.name}`}
                onClick={() => removeTab(tab.id)}
              >
                <IoClose size={16} />
              </button>
            </div>
          ) : (
            <button
              key={tab.id}
              className="flex items-center justify-center px-1 rounded-t-lg"
              onClick={() => switchTab(tab.id)}
            >
              <div className="px-3 py-1 pr-7 rounded-t-lg hover:text-neutral-500 hover:bg-[#1b212b] transition-colors">
                {tab.name}
              </div>
            </button>
          )
        )}
        <div className="flex items-center justify-center ml-2">
          <button
            className="p-0.5 rounded-full hover:bg-neutral-300 transition-colors"
            title="New tab"
            aria-label="New tab"
            onClick={addTab}
          >
            <GoPlus size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

TabBar.propTypes = {
  tabs: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
      code: PropTypes.string.isRequired
    })
  ).isRequired,
  activeTab: PropTypes.number.isRequired,
  setTabs: PropTypes.func.isRequired,
  setActiveTab: PropTypes.func.isRequired
};
