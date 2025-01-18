import PropTypes from 'prop-types';
import { GoPlus } from 'react-icons/go';
import { IoClose } from 'react-icons/io5';

export const TabBar = ({
  tabs,
  activeTab,
  setTabs,
  setActiveTab,
  setOutput,
  executeCode
}) => {
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
    setOutput('');
  };

  const removeTab = id => {
    if (tabs.length <= 1) return;
    const newTabs = tabs.filter(tab => tab.id !== id);
    setTabs(newTabs);
    if (activeTab === id) {
      setActiveTab(newTabs[0].id);
    }
  };

  const switchTab = id => {
    setActiveTab(id);
    const code = tabs.find(tab => tab.id === id)?.code || '';
    executeCode(code);
  };

  return (
    <div className="flex gap-1 px-2 select-none bg-[#14181f]">
      <div className="flex gap-2 items-center justify-center px-1">
        <button className="w-3 h-3 rounded-full bg-red-500"></button>
        <button className="w-3 h-3 rounded-full bg-yellow-500"></button>
        <button className="w-3 h-3 rounded-full bg-green-500"></button>
      </div>
      <div className="flex flex-nowrap px-2 h-[40px] whitespace-nowrap overflow-x-auto scrollbar-hidden text-neutral-600">
        {tabs.map(tab =>
          activeTab === tab.id ? (
            <div
              key={tab.id}
              className="group flex items-center justify-center gap-2 pl-4 pr-3 rounded-t-lg text-neutral-300 bg-[#212830]"
            >
              <div>{tab.name}</div>
              <button
                className="flex items-center justify-center mt-0.5 w-4 h-4 rounded-full hover:bg-[#464d5a]"
                onClick={() => removeTab(tab.id)}
              >
                <IoClose size={16} />
              </button>
            </div>
          ) : (
            <button
              key={tab.id}
              className="flex items-center justify-center px-2 rounded-t-lg"
              onClick={() => switchTab(tab.id)}
            >
              <div className="px-2 pr-7 rounded-lg hover:text-neutral-500 hover:bg-[#1b212b] transition-colors">
                {tab.name}
              </div>
            </button>
          )
        )}
        <div className="flex items-center justify-center ml-2">
          <button
            className="p-0.5 rounded-full hover:bg-neutral-300 transition-colors"
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
  setActiveTab: PropTypes.func.isRequired,
  setOutput: PropTypes.func.isRequired,
  executeCode: PropTypes.func.isRequired
};
