import React, { useState } from 'react'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/material-darker.css'
import 'codemirror/mode/xml/xml'
import 'codemirror/mode/python/python'
import 'codemirror/mode/javascript/javascript'
import 'codemirror/mode/css/css'
import 'codemirror/mode/verilog/verilog'
import 'codemirror/mode/clike/clike'
import { Controlled as ControlledEditor } from 'react-codemirror2'
import CodeSelect from './components/codeSelect'
import FileStructure from './structure'
import { diffLines } from 'diff'
import sliceLines from 'slice-lines'
import transfer from './functions/transfer'
const client = new WebSocket('ws://localhost:4000')

const codingOptions = [
    { label: 'Python', value: 'python' },
    { label: 'HTML', value: 'xml' },
    { label: 'Javascript', value: 'javascript' },
    { label: 'C++', value: 'text/x-c++src' },
    { label: 'Verilog', value: 'verilog' },
    { label: 'CSS', value: 'css' },
]

export default function Editor(props) {
    //const { codes, opened, sendCodes } = useEdit();
    const ls=['/src/components/SkrikPage.js','/src/components/SkrikPage.css','/src/index.js','/src/index.html','/src/text.py','/package.js']
    const [filesStructure, setFile] = useState(ls);
    const [tree,setTree] = useState(transfer(ls));
    const [language, setLan] = useState('python');
    const [pathChanged,setPath] = useState("")
    
    function onChangeCode(value) {
        setLan(value.value);
    }
    function onChange(value) {
        sendCodes(value);
    }

    const [codes, setCodes] = useState('')
    const [opened, setOpened] = useState(false)

    client.onmessage = (message) => {
        const { data } = message
        const [task, update] = JSON.parse(data)
        console.log(update)
        if (task === 'output') {
            let tmp = codes;
            const content = update.content
            content.forEach((part) => {
                if (part.ope === 0) {
                    if (part.start === 0) tmp = part.content + sliceLines(tmp, part.start)
                    else tmp = sliceLines(tmp, 0, part.start) + '\n' + part.content + sliceLines(tmp, part.start)
                }
                else {
                    if (part.start === 0) tmp = sliceLines(tmp, part.end)
                    else tmp = sliceLines(tmp, 0, part.start) + '\n' + sliceLines(tmp, part.end)
                }
            })
            setCodes(tmp)
        }
        else if(task === 'output-path'){
            setFile([...filesStructure,update])
            setTree(transfer([...filesStructure,update]))
            console.log(update)
        }
    }

    client.onopen = () => {
        console.log('onopen')
        setOpened(true)
    }

    const sendData = (data) => {
        client.send(JSON.stringify(data))
    }

    const sendCodes = (code) => {
        let diff = diffLines(codes, code)
        let diff_code = []
        let count_line = 0
        diff.forEach((part) => {
            if (part.added) {
                diff_code.push({ ope: 0, start: count_line, end: count_line + part.count, content: part.value })
                count_line += part.count
            }
            else if (part.removed) {
                diff_code.push({ ope: 1, start: count_line, end: count_line + part.count, content: part.value })
            }
            else {
                count_line += part.count
            }
        })
        sendData(['input', { author: 'a', content: diff_code }])
    }

    const sendNewFile = (ls) => {
        setPath(ls)
        sendData(['path', ls])
    }
    return (
        <div>
            <span>{pathChanged}</span>
            <div className='page_container'>
                <div id='folder_structure'>
                    <FileStructure returnNewFile={sendNewFile} updatefile={tree}/>
                </div>
                <div id='editor_container'>
                    <div id='editor_title'>
                        File Name
                        <CodeSelect options={codingOptions} onChange={onChangeCode} />
                    </div>

                    <ControlledEditor
                        onBeforeChange={(editor, data, value) => { onChange(value); }}
                        value={opened ? codes : 'Loading...'}
                        className="code_mirror_wrapper"
                        options={{
                            lineWrapping: true,
                            lint: true,
                            mode: language,
                            theme: 'material-darker',
                            lineNumbers: true,
                            cursorHeight: 0.85,
                        }}
                        placeholder='Select a code mode...'
                        defaultValue={{ label: "Select a code mode...", value: 0 }}
                    />
                </div>
            </div>
        </div>
    )
}

