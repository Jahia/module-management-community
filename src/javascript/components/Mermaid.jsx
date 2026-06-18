import React, {useCallback, useEffect, useRef, useState} from 'react';
import mermaid from 'mermaid';
import elkLayouts from '@mermaid-js/layout-elk';
import PropTypes from 'prop-types';

let instanceCount = 0;

const Mermaid = ({className, children, onError}) => {
    const [element, setElement] = useState();
    const [renderResult, setRenderResult] = useState();

    // Stable ID: assigned once on mount, never changes on re-renders.
    // Using a ref guard prevents instanceCount from incrementing on every render,
    // which would make containerId a new value each render and trigger an infinite
    // useEffect loop (containerId in deps → setRenderResult → re-render → new ID → …).
    const containerIdRef = useRef(null);
    if (containerIdRef.current === null) {
        containerIdRef.current = `d${instanceCount++}-mermaid`;
    }

    const containerId = containerIdRef.current;
    const diagramText = children;

    // Initialize mermaid once on mount
    useEffect(() => {
        mermaid.registerLayoutLoaders(elkLayouts);
        mermaid.initialize({
            startOnLoad: false,
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
    }, []);

    // Track the container DOM element via a stable callback ref
    const updateDiagramRef = useCallback(elem => {
        if (!elem) {
            return;
        }

        setElement(elem);
    }, []);

    // Inject the rendered SVG into the container whenever either changes
    useEffect(() => {
        if (!element || !renderResult?.svg) {
            return;
        }

        element.innerHTML = renderResult.svg;
        renderResult.bindFunctions?.(element);
    }, [element, renderResult]);

    // Re-render the diagram whenever the diagram text changes
    useEffect(() => {
        if (!diagramText || diagramText.length === 0) {
            return;
        }

        (async () => {
            try {
                const rr = await mermaid.render(`${containerId}-svg`, diagramText);
                setRenderResult(rr);
            } catch (e) {
                onError?.(e);
            }
        })();
    // ContainerId is stable (ref) — safe to include; diagramText drives re-renders
    }, [containerId, diagramText, onError]);

    return (
        <div ref={updateDiagramRef}
             className={className}
             id={containerId}
        />
    );
};

Mermaid.propTypes = {
    className: PropTypes.string,
    children: PropTypes.any.isRequired,
    onError: PropTypes.func
};

export default Mermaid;
