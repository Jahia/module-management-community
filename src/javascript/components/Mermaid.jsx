import React, {useCallback, useEffect, useRef, useState} from 'react';
import mermaid from 'mermaid';
import elkLayouts from '@mermaid-js/layout-elk';
import PropTypes from 'prop-types';

let instanceCount = 0;

const Mermaid = ({className, children, onError}) => {
    const [element, setElement] = useState();
    const [renderResult, setRenderResult] = useState();
    if (instanceCount === undefined) {
        instanceCount = 0;
    }

    const containerId = `d${instanceCount++}-mermaid`;
    const diagramText = children;
    const renderJS = true;

    // Initialize mermaid here, but beware that it gets called once for every instance of the component
    useEffect(() => {
        // Wait for page to load before initializing mermaid
        if (renderJS) {
            mermaid.registerLayoutLoaders(elkLayouts);
            mermaid.initialize({
                startOnLoad: true,
                securityLevel: 'strict',
                theme: 'neutral',
                logLevel: 0,
                layout: 'elk',
                elk: {
                    mergeEdges: true,
                    edgeRouting: 'LINEAR_SEGMENTS'
                },
                flowchart: {
                    defaultRenderer: 'elk'
                }
            });
        }
    }, [renderJS]);

    // Hook to track updates to the component ref, compatible with useEffect unlike useRef
    const updateDiagramRef = useCallback(elem => {
        if (!elem) {
            return;
        }

        setElement(elem);
    }, []);

    // Hook to update the component when either the element or the rendered diagram changes
    useEffect(() => {
        if (!element) {
            return;
        }

        if (!renderResult?.svg) {
            return;
        }

        element.innerHTML = renderResult.svg;
        renderResult.bindFunctions?.(element);
    }, [
        element,
        renderResult
    ]);

    // Hook to handle the diagram rendering
    useEffect(() => {
        if (!diagramText && diagramText.length === 0) {
            return;
        }

        // Create async function inside useEffect to cope with async mermaid.run
        if (renderJS) {
            (async () => {
                try {
                    const rr = await mermaid.render(`${containerId}-svg`, diagramText);
                    setRenderResult(rr);
                } catch (e) {
                    onError?.(e);
                }
            })();
        }
    }, [
        diagramText,
        onError
    ]);

    // Render container (div) to hold diagram (nested SVG)
    return (
        <div ref={updateDiagramRef}
             className={className}
             id={containerId}
        >
            {renderJS}
        </div>
    );
};

Mermaid.propTypes = {
    className: PropTypes.string,
    children: PropTypes.any.isRequired,
    onError: PropTypes.func
};

export default Mermaid;
