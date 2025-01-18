import PropTypes from 'prop-types';

export const OutputPanel = ({
  output,
  editorRef,
  outputRef,
  editorSeparator
}) => {
  const handleScrollOutput = () => {
    if (editorRef.current && outputRef.current) {
      editorRef.current.setScrollPosition({
        scrollTop: outputRef.current.scrollTop
      });
    }
  };

  return (
    <div
      ref={outputRef}
      className="py-5 px-4 h-[calc(100vh-40px)] leading-[1.36] text-[14px] overflow-y-auto text-neutral-300"
      style={{ width: `${100 - editorSeparator}vw` }}
      onScroll={handleScrollOutput}
    >
      <pre className="pb-[calc(100vh-42px)]">{output}</pre>
    </div>
  );
};

OutputPanel.propTypes = {
  output: PropTypes.string.isRequired,
  editorRef: PropTypes.object.isRequired,
  outputRef: PropTypes.object.isRequired,
  editorSeparator: PropTypes.number.isRequired
};
