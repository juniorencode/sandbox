import PropTypes from 'prop-types';

export const OutputPanel = ({ output, editorRef, outputRef }) => {
  const handleScrollOutput = () => {
    if (editorRef.current && outputRef.current) {
      editorRef.current.setScrollPosition({
        scrollTop: outputRef.current.scrollTop
      });
    }
  };

  return (
    <div
      className="py-5 px-4 w-[40vw] h-[calc(100vh-40px)] leading-[1.36] text-[14px] overflow-y-auto text-neutral-300"
      onScroll={handleScrollOutput}
    >
      <pre className="pb-[calc(100vh-42px)]">{output}</pre>
    </div>
  );
};

OutputPanel.propTypes = {
  output: PropTypes.string.isRequired,
  editorRef: PropTypes.object.isRequired,
  outputRef: PropTypes.object.isRequired
};
