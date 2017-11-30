require 'rack'
require 'rack/parser'
require 'etc'

$:.unshift %[#{File.dirname(__FILE__)}/lib]

use Rack::Parser, :content_types => {
    'application/json'  => Proc.new { |body| JSON.parse body }
}

require './app'
run Scatter::App
